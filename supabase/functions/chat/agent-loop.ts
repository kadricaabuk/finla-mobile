import Anthropic from "npm:@anthropic-ai/sdk";
import { assembleSystemPrompt, filterToolsWithEphemeralPromptCacheLast, TOOLS } from "../_shared/tools.ts";
import {
  formatTrDate,
  ISTANBUL_TZ,
  istanbulTodayUtc,
} from "./date-range.ts";
import {
  classifyGibOperationError,
} from "./gib-tool-errors.ts";
import { encodeNdjsonEvent } from "./ndjson-stream.ts";
import { executeTool } from "./tools/index.ts";
import type { InvoiceDetailPayload } from "./types.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js";

export const MAX_AGENT_ROUNDS = 8;

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! });

function anthropicToolsForChat(): Anthropic.Tool[] {
  return filterToolsWithEphemeralPromptCacheLast(
    TOOLS,
    new Set(TOOLS.map((t) => t.name)),
  );
}

export function buildDynamicSystemPromptForAgent(): string {
  return `${assembleSystemPrompt()}

Bugunun tarihi: ${formatTrDate(istanbulTodayUtc())}
Saat dilimi: ${ISTANBUL_TZ}`;
}

export type AgentLoopAccumulator = {
  assistantText: string;
  usedFinanceTool: boolean;
  usedToolNames: Set<string>;
  latestInvoiceActionPayload: InvoiceDetailPayload | null;
  lastListInvoicesInput: Record<string, unknown> | null;
  lastExportExcelPayload: {
    download_url: string;
    file_name: string;
    row_count: number;
    expires_in_seconds: number;
  } | null;
};

export async function runAnthropicToolLoop(
  supabase: SupabaseClient,
  claudeMessages: Anthropic.MessageParam[],
  username: string,
  userMsg: string,
  convId: string,
  dynamicSystemPrompt: string,
  ndjsonWriter: WritableStreamDefaultWriter<Uint8Array> | null,
): Promise<AgentLoopAccumulator> {
  let assistantText = "";
  let usedFinanceTool = false;
  const usedToolNames = new Set<string>();
  let latestInvoiceActionPayload: InvoiceDetailPayload | null = null;
  let lastListInvoicesInput: Record<string, unknown> | null = null;
  let lastExportExcelPayload: AgentLoopAccumulator["lastExportExcelPayload"] =
    null;

  const anthropicRoundParams =
    (): Anthropic.MessageCreateParamsNonStreaming => ({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1536,
      system: [
        {
          type: "text",
          text: dynamicSystemPrompt,
          // @ts-ignore - cache_control for prompt caching
          cache_control: { type: "ephemeral" },
        },
      ],
      tools: anthropicToolsForChat(),
      messages: claudeMessages,
    });

  for (let round = 0; round < MAX_AGENT_ROUNDS; round++) {
    const params = anthropicRoundParams();
    const roundPieces: string[] = [];
    let response: Anthropic.Message;

    if (ndjsonWriter) {
      const stream = anthropic.messages.stream(params);
      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          roundPieces.push(event.delta.text);
        }
      }
      response = await stream.finalMessage();
    } else {
      response = await anthropic.messages.create(params);
    }

    const textParts = response.content
      .filter((b: Anthropic.ContentBlock) => b.type === "text")
      .map((b: Anthropic.ContentBlock) => (b as Anthropic.TextBlock).text);
    if (textParts.length) assistantText = textParts.join("");

    if (response.stop_reason === "end_turn") {
      if (ndjsonWriter && roundPieces.length > 0) {
        const full = roundPieces.join("");
        const step = 96;
        for (let i = 0; i < full.length; i += step) {
          await ndjsonWriter.write(
            encodeNdjsonEvent({
              type: "delta",
              text: full.slice(i, i + step),
            }),
          );
        }
      }
      break;
    }

    if (response.stop_reason === "tool_use") {
      const toolUseBlocks = response.content.filter(
        (b: Anthropic.ContentBlock) => b.type === "tool_use",
      ) as Anthropic.ToolUseBlock[];

      if (ndjsonWriter && toolUseBlocks.length > 0) {
        const label = toolUseBlocks.map((b) => b.name).join(",");
        await ndjsonWriter.write(
          encodeNdjsonEvent({ type: "tool", phase: "start", name: label }),
        );
      }

      claudeMessages.push({ role: "assistant", content: response.content });

      const toolResults = await Promise.all(
        toolUseBlocks.map(async (block) => {
          let content: string;
          try {
            const result = await executeTool(
              supabase,
              block.name,
              block.input as Record<string, unknown>,
              username,
              userMsg,
              convId,
              {
                source: "agent",
                tool_use_id: block.id,
                agent_round: round,
                ndjsonWriter,
              },
            );
            if (
              block.name === "invoice_totals" ||
              block.name === "latest_invoice" ||
              block.name === "export_invoices_excel"
            ) {
              usedFinanceTool = true;
            }
            if (
              block.name === "latest_invoice" &&
              result &&
              typeof result === "object" &&
              (result as { invoice?: InvoiceDetailPayload }).invoice
            ) {
              latestInvoiceActionPayload = (
                result as { invoice: InvoiceDetailPayload }
              ).invoice;
            }
            if (block.name === "list_invoices") {
              lastListInvoicesInput = block.input as Record<string, unknown>;
            }
            if (
              block.name === "export_invoices_excel" && result !== null &&
              typeof result === "object"
            ) {
              const r = result as Record<string, unknown>;
              if (
                typeof r.download_url === "string" &&
                typeof r.file_name === "string"
              ) {
                lastExportExcelPayload = {
                  download_url: r.download_url,
                  file_name: r.file_name,
                  row_count:
                    typeof r.row_count === "number" &&
                      Number.isFinite(r.row_count)
                      ? r.row_count
                      : 0,
                  expires_in_seconds:
                    typeof r.expires_in_seconds === "number" &&
                      Number.isFinite(r.expires_in_seconds)
                      ? r.expires_in_seconds
                      : 300,
                };
              }
            }
            usedToolNames.add(block.name);
            content = JSON.stringify(result);
          } catch (err) {
            const classified = classifyGibOperationError(err, block.name);
            content = JSON.stringify({
              error: classified.message,
              error_code: classified.code,
            });
          }
          return {
            type: "tool_result" as const,
            tool_use_id: block.id,
            content,
          };
        }),
      );

      claudeMessages.push({ role: "user", content: toolResults });

      if (ndjsonWriter && toolUseBlocks.length > 0) {
        const label = toolUseBlocks.map((b) => b.name).join(",");
        await ndjsonWriter.write(
          encodeNdjsonEvent({ type: "tool", phase: "end", name: label }),
        );
      }
      continue;
    }

    break;
  }

  return {
    assistantText,
    usedFinanceTool,
    usedToolNames,
    latestInvoiceActionPayload,
    lastListInvoicesInput,
    lastExportExcelPayload,
  };
}
