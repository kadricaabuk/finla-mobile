import type { SupabaseClient } from "npm:@supabase/supabase-js";
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
import { normalizeInvoiceListToolResult } from "./list-format.ts";
import type { FinlaSession } from "../_shared/session-auth.ts";
import type { InvoiceDetailPayload } from "./types.ts";
import {
  formatPendingInvoiceForPrompt,
  loadPendingInvoice,
} from "../_shared/invoice-workflow.ts";
import {
  formatChatContextForPrompt,
  loadChatContext,
  persistChatContext,
  type ChatContext,
} from "./conversation-context.ts";
import type { InvoiceDirection } from "../_shared/invoice-facts.ts";

export const MAX_AGENT_ROUNDS = 8;

export { CHAT_HISTORY_MESSAGE_LIMIT } from "./chat-history.ts";

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! });

function anthropicToolsForChat(): Anthropic.Tool[] {
  return filterToolsWithEphemeralPromptCacheLast(
    TOOLS,
    new Set(TOOLS.map((t) => t.name)),
  );
}

export async function buildDynamicSystemPromptForAgent(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<string> {
  const [ctx, pending] = await Promise.all([
    loadChatContext(supabase, conversationId),
    loadPendingInvoice(supabase, conversationId),
  ]);
  return `${assembleSystemPrompt()}

Bugunun tarihi: ${formatTrDate(istanbulTodayUtc())}
Saat dilimi: ${ISTANBUL_TZ}${formatChatContextForPrompt(ctx)}${formatPendingInvoiceForPrompt(pending)}`;
}

function chatContextFromTool(
  toolName: string,
  input: Record<string, unknown>,
  result: unknown,
): ChatContext | null {
  const patch: ChatContext = { last_tool: toolName };
  const direction =
    input.direction === "incoming" || input.direction === "outgoing"
      ? input.direction
      : result && typeof result === "object" &&
          ((result as Record<string, unknown>).direction === "incoming" ||
            (result as Record<string, unknown>).direction === "outgoing")
        ? (result as Record<string, unknown>).direction as InvoiceDirection
        : undefined;
  if (direction) patch.last_direction = direction;

  const start =
    typeof input.start_date === "string"
      ? input.start_date
      : result && typeof result === "object" &&
          typeof (result as Record<string, unknown>).start_date === "string"
        ? (result as Record<string, unknown>).start_date as string
        : undefined;
  const end =
    typeof input.end_date === "string"
      ? input.end_date
      : result && typeof result === "object" &&
          typeof (result as Record<string, unknown>).end_date === "string"
        ? (result as Record<string, unknown>).end_date as string
        : undefined;
  if (start && end) {
    patch.last_date_range = { startDate: start, endDate: end };
  }

  const counterparty =
    typeof input.customer_name === "string" && input.customer_name.trim()
      ? input.customer_name.trim()
      : undefined;
  if (counterparty) patch.last_counterparty = counterparty;

  if (toolName === "invoice_financial_summary") {
    patch.last_direction = undefined;
  }

  return patch;
}

export type AgentLoopAccumulator = {
  assistantText: string;
  usedFinanceTool: boolean;
  usedToolNames: Set<string>;
  latestInvoiceActionPayload: InvoiceDetailPayload | null;
  lastListInvoicesInput: Record<string, unknown> | null;
  lastListInvoicesResult: ReturnType<typeof normalizeInvoiceListToolResult> | null;
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
  session: FinlaSession,
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
  let lastListInvoicesResult: ReturnType<typeof normalizeInvoiceListToolResult> | null = null;
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
    let response: Anthropic.Message;

    if (ndjsonWriter) {
      const stream = anthropic.messages.stream(params);
      let streamedTextLen = 0;
      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          const chunk = event.delta.text;
          streamedTextLen += chunk.length;
          await ndjsonWriter.write(
            encodeNdjsonEvent({ type: "delta", text: chunk }),
          );
        }
      }
      response = await stream.finalMessage();
      if (response.stop_reason === "tool_use") {
        const fullText = response.content
          .filter((b: Anthropic.ContentBlock) => b.type === "text")
          .map((b: Anthropic.ContentBlock) => (b as Anthropic.TextBlock).text)
          .join("");
        const unsent = fullText.slice(streamedTextLen);
        if (unsent) {
          await ndjsonWriter.write(
            encodeNdjsonEvent({ type: "delta", text: unsent }),
          );
        }
      }
    } else {
      response = await anthropic.messages.create(params);
    }

    const textParts = response.content
      .filter((b: Anthropic.ContentBlock) => b.type === "text")
      .map((b: Anthropic.ContentBlock) => (b as Anthropic.TextBlock).text);
    const roundText = textParts.join("");
    if (roundText) {
      assistantText = assistantText
        ? `${assistantText}\n\n${roundText}`
        : roundText;
    }

    if (response.stop_reason === "max_tokens") {
      const suffix = "\n\n(Cevap uzunluğu sınırına ulaştı; kısaltıldı.)";
      assistantText += suffix;
      if (ndjsonWriter) {
        await ndjsonWriter.write(
          encodeNdjsonEvent({ type: "delta", text: suffix }),
        );
      }
      break;
    }

    if (response.stop_reason === "end_turn") {
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

      const ctxPatches: ChatContext[] = [];
      const toolResults = await Promise.all(
        toolUseBlocks.map(async (block) => {
          let content: string;
          try {
            const result = await executeTool(
              supabase,
              block.name,
              block.input as Record<string, unknown>,
              session,
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
              block.name === "invoice_financial_summary" ||
              block.name === "latest_invoice" ||
              block.name === "list_invoices" ||
              block.name === "export_invoices_excel"
            ) {
              usedFinanceTool = true;
            }
            if (
              block.name === "latest_invoice" &&
              result &&
              typeof result === "object"
            ) {
              const row = result as Record<string, unknown>;
              if (row.status === "ambiguous_customer") {
                // Tekil sonuç yok; model aday listesinden seçim isteyecek.
              } else if ((row.invoice as InvoiceDetailPayload)?.invoice_uuid) {
                latestInvoiceActionPayload = row.invoice as InvoiceDetailPayload;
              }
            }
            if (block.name === "list_invoices") {
              lastListInvoicesInput = block.input as Record<string, unknown>;
              lastListInvoicesResult = normalizeInvoiceListToolResult(result);
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
            const ctxPatch = chatContextFromTool(
              block.name,
              block.input as Record<string, unknown>,
              result,
            );
            if (ctxPatch) {
              ctxPatches.push(ctxPatch);
            }
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

      if (ctxPatches.length > 0) {
        const merged = ctxPatches.reduce(
          (acc, patch) => ({ ...acc, ...patch }),
          {} as ChatContext,
        );
        await persistChatContext(supabase, convId, merged);
      }

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
    lastListInvoicesResult,
    lastExportExcelPayload,
  };
}
