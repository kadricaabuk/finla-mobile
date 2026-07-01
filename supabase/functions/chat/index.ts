import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import {
  conversationOwnedByUser,
  isValidConversationId,
} from "../_shared/conversation-access.ts";
import { buildPendingDraftPreviewAction, canFastPathConfirmInvoiceIssue, loadPendingInvoice, resolvePendingDraftRef, shouldSkipFinanceFastPaths } from "../_shared/invoice-workflow.ts";
import {
  requireFinlaSession,
  SessionAuthError,
} from "../_shared/session-auth.ts";
import {
  buildDynamicSystemPromptForAgent,
  runAnthropicToolLoop,
} from "./agent-loop.ts";
import { finalizeAgentAssistant } from "./finalize.ts";
import { resolveDateRangeFromText } from "./date-range.ts";
import {
  buildIssuedInvoicePreviewAction,
  loadChatContext,
  loadStoredLastInvoice,
  persistChatContext,
  persistLastInvoice,
} from "./conversation-context.ts";
import {
  isBareInvoiceShowIntent,
  isConfirmLikeMessage,
  isExcelExportIntent,
  isFinancialTotalsIntent,
  isIncomingInvoiceListIntent,
  isInvoiceListIntent,
  isLatestInvoiceIntent,
  parseFinancialDirection,
  parseFiltersFromText,
  parseInvoiceDirectionFromMessage,
  parseInvoiceListDirection,
} from "./intents.ts";
import {
  buildLatestInvoiceDetailAction,
  buildPrimaryInvoicesAction,
  formatFinancialSummaryChatSummary,
  formatInvoiceListChatSummary,
  formatInvoiceTotalsChatSummary,
  formatLatestInvoiceChatSummary,
  normalizeInvoiceListToolResult,
  normalizeLatestInvoiceToolResult,
} from "./list-format.ts";
import {
  clientWantsNdjsonStream,
  encodeNdjsonEvent,
  NDJSON_CONTENT_TYPE,
} from "./ndjson-stream.ts";
import { loadAgentChatHistory } from "./chat-history.ts";
import { jsonChatOk, jsonError } from "./http-response.ts";
import { persistableAction } from "./persist-action.ts";
import { executeTool } from "./tools/index.ts";
import type { ChatAction, PendingInvoiceState } from "./types.ts";

export {
  buildDynamicSystemPromptForAgent,
  runAnthropicToolLoop,
} from "./agent-loop.ts";
export { finalizeAgentAssistant } from "./finalize.ts";
export { executeTool } from "./tools/index.ts";
export type { ChatAction, InvoiceDetailPayload, PendingInvoiceState } from "./types.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const session = await requireFinlaSession(req);
    const body = await req.json() as {
      message?: string;
      conversationId?: string | null;
      action?: {
        type?: string;
        draftUuid?: string;
      };
      stream?: boolean;
    };
    const { message, conversationId, action: requestAction } = body;

    const hasMessage = typeof message === "string" && message.trim().length > 0;
    const hasAction = !!requestAction;
    if (!session.userId || (!hasMessage && !hasAction)) {
      return jsonError("message zorunludur.", 400);
    }

    let convId = conversationId;
    if (!convId) {
      const titleSource = hasMessage
        ? message!.trim()
        : requestAction?.type === "confirm_pending_invoice"
        ? "Fatura onayı"
        : "Sohbet";
      const { data: conv, error } = await supabase
        .from("conversations")
        .insert({
          user_id: session.userId,
          gib_username: session.phone ?? session.userId,
          title: titleSource.slice(0, 60),
        })
        .select("id")
        .single();
      if (error) throw error;
      convId = conv.id;
    } else {
      if (!isValidConversationId(convId)) {
        return jsonError("conversationId geçersiz.", 400);
      }
      const owned = await conversationOwnedByUser(
        supabase,
        convId,
        session.userId,
      );
      if (!owned) {
        return jsonError("Sohbet bulunamadı.", 404);
      }
    }

    if (typeof convId !== "string") {
      return jsonError("conversation id gerekli.", 400);
    }

    const cid = convId;
    const pendingState = await loadPendingInvoice(supabase, cid);
    const skipFinanceFastPaths = shouldSkipFinanceFastPaths(pendingState);

    await supabase.from("messages").insert({
      conversation_id: cid,
      role: "user",
      content: hasAction ? "[action]" : (hasMessage ? message! : ""),
    });

    const isConfirmMessage = isConfirmLikeMessage(message ?? "");
    const isConfirmAction = requestAction?.type === "confirm_pending_invoice";

    if (isConfirmAction) {
      const pending = await loadPendingInvoice(supabase, cid);
      const draftRef = resolvePendingDraftRef(pending);

      if (!canFastPathConfirmInvoiceIssue(pending)) {
        const noDraftMsg = pending?.status === "exchange_rate_pending"
          ? "Önce döviz kurunu onaylamalıyız. Sohbette «onaylıyorum» yazabilirsin."
          : "Onay bekleyen taslak bulunamadı. Önce fatura taslağı oluşturmalıyız.";
        await supabase.from("messages").insert({
          conversation_id: cid,
          role: "assistant",
          content: noDraftMsg,
        });
        return Response.json(
          { message: noDraftMsg, conversationId: cid, action: null },
          { headers: corsHeaders },
        );
      }

      if (
        typeof requestAction?.draftUuid === "string" &&
        requestAction.draftUuid !== draftRef!.uuid
      ) {
        const mismatchMsg =
          "Onaylanacak taslak değişmiş görünüyor. Lütfen en son önizleme kartını kullan.";
        await supabase.from("messages").insert({
          conversation_id: cid,
          role: "assistant",
          content: mismatchMsg,
        });
        return Response.json(
          { message: mismatchMsg, conversationId: cid, action: null },
          { headers: corsHeaders },
        );
      }
      try {
        const result = await executeTool(
          supabase,
          "confirm_invoice_issue",
          {},
          session,
          message ?? "",
          cid,
          { source: "fast_path" },
        );
        const payload = result as { uuid?: string; message?: string };
        const directMessage = payload?.uuid
          ? `Fatura Mysoft üzerinden GİB'e gönderildi.\n\nETTN: ${payload.uuid}\n\nİstersen şimdi "faturayı gör" diyebilirsin.`
          : (payload?.message ?? "Fatura kesildi.");
        await supabase.from("messages").insert({
          conversation_id: cid,
          role: "assistant",
          content: directMessage,
        });
        return Response.json(
          { message: directMessage, conversationId: cid, action: null },
          { headers: corsHeaders },
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Fatura kesilemedi.";
        const failText = `Fatura kesimi başarısız: ${msg}`;
        await supabase.from("messages").insert({
          conversation_id: cid,
          role: "assistant",
          content: failText,
        });
        return Response.json(
          { message: failText, conversationId: cid, action: null },
          { headers: corsHeaders },
        );
      }
    }

    if (
      hasMessage &&
      !isConfirmMessage &&
      !isConfirmAction &&
      isExcelExportIntent(message ?? "") &&
      !skipFinanceFastPaths
    ) {
      try {
        const filters = parseFiltersFromText(message ?? "");
        const msgDir = parseInvoiceDirectionFromMessage(message ?? "");
        const chatCtx = await loadChatContext(supabase, cid);
        const toolInput: Record<string, unknown> = {};
        if (msgDir) toolInput.direction = msgDir;
        if (filters.customerName) toolInput.customer_name = filters.customerName;
        if (typeof filters.amountGte === "number") {
          toolInput.amount_gte = filters.amountGte;
        }
        if (typeof filters.amountEq === "number") {
          toolInput.amount_eq = filters.amountEq;
        }
        const hasExplicitDate = resolveDateRangeFromText(message ?? "") !== null;
        if (!hasExplicitDate && chatCtx?.last_date_range) {
          toolInput.start_date = chatCtx.last_date_range.startDate;
          toolInput.end_date = chatCtx.last_date_range.endDate;
        }
        const result = await executeTool(
          supabase,
          "export_invoices_excel",
          toolInput,
          session,
          message ?? "",
          cid,
          { source: "fast_path" },
        );
        const row = result && typeof result === "object"
          ? result as Record<string, unknown>
          : {};
        const rowCount =
          typeof row.row_count === "number" && Number.isFinite(row.row_count)
            ? row.row_count
            : 0;
        const fileName =
          typeof row.file_name === "string" && row.file_name.trim()
            ? row.file_name.trim()
            : "finla-export.xlsx";
        const downloadUrl =
          typeof row.download_url === "string" ? row.download_url : "";
        const directMessage = rowCount > 0
          ? `${fileName} hazır — ${rowCount} fatura. Alttaki düğmeyle indirip paylaşabilirsin.`
          : "Seçilen dönemde dışa aktarılacak fatura bulunamadı.";
        const action = downloadUrl
          ? {
            type: "open_excel_export" as const,
            label: `Excel indir (${rowCount} fatura)`,
            excel_export: {
              download_url: downloadUrl,
              file_name: fileName,
              row_count: rowCount,
              expires_in_seconds:
                typeof row.expires_in_seconds === "number"
                  ? row.expires_in_seconds
                  : 300,
            },
          }
          : null;
        await persistChatContext(supabase, cid, {
          last_tool: "export_invoices_excel",
          last_direction: msgDir ?? undefined,
        });
        await supabase.from("messages").insert({
          conversation_id: cid,
          role: "assistant",
          content: directMessage,
          action_snapshot: persistableAction(action),
        });
        return Response.json(
          { message: directMessage, conversationId: cid, action },
          { headers: corsHeaders },
        );
      } catch (err) {
        const msg = err instanceof Error
          ? err.message
          : "Excel dışa aktarılamadı.";
        const failText = `Excel oluşturulamadı: ${msg}`;
        await supabase.from("messages").insert({
          conversation_id: cid,
          role: "assistant",
          content: failText,
        });
        return Response.json(
          { message: failText, conversationId: cid, action: null },
          { headers: corsHeaders },
        );
      }
    }

    if (
      hasMessage &&
      !isConfirmMessage &&
      !isConfirmAction &&
      isBareInvoiceShowIntent(message ?? "")
    ) {
      const pending = await loadPendingInvoice(supabase, cid);
      if (pending?.draft?.uuid) {
        const previewAction = await buildPendingDraftPreviewAction(
          session,
          pending,
        );
        const directMessage = previewAction
          ? "Taslak faturanı önizlemede açtım. Kontrol et; uygunsa «Onayla ve Kes» ile GİB'e gönderebiliriz."
          : "Taslak bulunamadı. Önce fatura bilgilerini verip taslak oluşturalım.";
        await supabase.from("messages").insert({
          conversation_id: cid,
          role: "assistant",
          content: directMessage,
        });
        return Response.json(
          {
            message: directMessage,
            conversationId: cid,
            action: previewAction,
          },
          { headers: corsHeaders },
        );
      }

      const last = await loadStoredLastInvoice(supabase, cid);
      if (last?.uuid) {
        const previewAction = buildIssuedInvoicePreviewAction(last);
        const who = last.customer_name?.trim();
        const directMessage = who
          ? `${who} faturasını önizlemede açıyorum.`
          : "Faturayı önizlemede açıyorum.";
        await supabase.from("messages").insert({
          conversation_id: cid,
          role: "assistant",
          content: directMessage,
          action_snapshot: persistableAction(previewAction),
        });
        return Response.json(
          {
            message: directMessage,
            conversationId: cid,
            action: previewAction,
          },
          { headers: corsHeaders },
        );
      }
    }

    if (
      hasMessage &&
      !isConfirmMessage &&
      !isConfirmAction &&
      isFinancialTotalsIntent(message ?? "") &&
      !skipFinanceFastPaths
    ) {
      try {
        const finDir = parseFinancialDirection(message ?? "");
        const filters = parseFiltersFromText(message ?? "");
        const toolInput: Record<string, unknown> = {};
        if (filters.customerName) toolInput.customer_name = filters.customerName;
        if (typeof filters.amountGte === "number") {
          toolInput.amount_gte = filters.amountGte;
        }
        if (typeof filters.amountEq === "number") {
          toolInput.amount_eq = filters.amountEq;
        }

        const toolName = finDir === "both"
          ? "invoice_financial_summary"
          : "invoice_totals";
        if (finDir !== "both") toolInput.direction = finDir;

        const result = await executeTool(
          supabase,
          toolName,
          toolInput,
          session,
          message ?? "",
          cid,
          { source: "fast_path" },
        );
        const directMessage = finDir === "both"
          ? formatFinancialSummaryChatSummary(result)
          : formatInvoiceTotalsChatSummary(result, finDir);
        await persistChatContext(supabase, cid, {
          last_tool: toolName,
          last_direction: finDir === "both" ? undefined : finDir,
          last_date_range: (() => {
            if (!result || typeof result !== "object") return undefined;
            const s = (result as Record<string, unknown>).start_date;
            const e = (result as Record<string, unknown>).end_date;
            return typeof s === "string" && typeof e === "string" && s && e
              ? { startDate: s, endDate: e }
              : undefined;
          })(),
          last_counterparty: filters.customerName,
        });
        await supabase.from("messages").insert({
          conversation_id: cid,
          role: "assistant",
          content: directMessage,
        });
        return Response.json(
          { message: directMessage, conversationId: cid, action: null },
          { headers: corsHeaders },
        );
      } catch (err) {
        const msg = err instanceof Error
          ? err.message
          : "Finansal özet getirilemedi.";
        const failText = `Finansal özet alınamadı: ${msg}`;
        await supabase.from("messages").insert({
          conversation_id: cid,
          role: "assistant",
          content: failText,
        });
        return Response.json(
          { message: failText, conversationId: cid, action: null },
          { headers: corsHeaders },
        );
      }
    }

    if (
      hasMessage &&
      !isConfirmMessage &&
      !isConfirmAction &&
      isIncomingInvoiceListIntent(message ?? "") &&
      !skipFinanceFastPaths
    ) {
      try {
        const listInput = { direction: "incoming" as const };
        const result = await executeTool(
          supabase,
          "list_invoices",
          listInput,
          session,
          message ?? "",
          cid,
          { source: "fast_path" },
        );
        const list = normalizeInvoiceListToolResult(result);
        const directMessage = formatInvoiceListChatSummary(list, "incoming");
        const action = buildPrimaryInvoicesAction(message ?? "", {
          ...listInput,
          start_date: list.start_date,
          end_date: list.end_date,
        }, list);
        await persistChatContext(supabase, cid, {
          last_tool: "list_invoices",
          last_direction: "incoming",
          last_date_range: list.start_date && list.end_date
            ? { startDate: list.start_date, endDate: list.end_date }
            : undefined,
        });
        await supabase.from("messages").insert({
          conversation_id: cid,
          role: "assistant",
          content: directMessage,
          action_snapshot: persistableAction(action),
        });
        return Response.json(
          { message: directMessage, conversationId: cid, action },
          { headers: corsHeaders },
        );
      } catch (err) {
        const msg = err instanceof Error
          ? err.message
          : "Gelen faturalar getirilemedi.";
        const failText = `Gelen fatura listesi alınamadı: ${msg}`;
        await supabase.from("messages").insert({
          conversation_id: cid,
          role: "assistant",
          content: failText,
        });
        return Response.json(
          { message: failText, conversationId: cid, action: null },
          { headers: corsHeaders },
        );
      }
    }

    if (
      hasMessage &&
      !isConfirmMessage &&
      !isConfirmAction &&
      isLatestInvoiceIntent(message ?? "") &&
      !skipFinanceFastPaths
    ) {
      try {
        const filters = parseFiltersFromText(message ?? "");
        const msgDir = parseInvoiceDirectionFromMessage(message ?? "");
        const toolInput: Record<string, unknown> = {};
        if (msgDir) toolInput.direction = msgDir;
        if (filters.customerName) {
          toolInput.customer_name = filters.customerName;
        }
        if (typeof filters.amountGte === "number") {
          toolInput.amount_gte = filters.amountGte;
        }
        if (typeof filters.amountEq === "number") {
          toolInput.amount_eq = filters.amountEq;
        }
        const result = await executeTool(
          supabase,
          "latest_invoice",
          toolInput,
          session,
          message ?? "",
          cid,
          { source: "fast_path" },
        );
        const latest = normalizeLatestInvoiceToolResult(result);
        const direction = latest.invoice?.direction ??
          (msgDir ?? "outgoing");
        const directMessage = formatLatestInvoiceChatSummary(
          latest,
          filters,
          direction,
        );
        const action =
          !latest.ambiguous && latest.invoice?.invoice_uuid
            ? buildLatestInvoiceDetailAction(latest.invoice)
            : null;
        if (latest.invoice?.invoice_uuid) {
          await persistLastInvoice(supabase, cid, latest.invoice);
        }
        await persistChatContext(supabase, cid, {
          last_tool: "latest_invoice",
          last_direction: direction,
          last_counterparty: filters.customerName,
        });
        await supabase.from("messages").insert({
          conversation_id: cid,
          role: "assistant",
          content: directMessage,
          action_snapshot: persistableAction(action),
        });
        return Response.json(
          {
            message: directMessage,
            conversationId: cid,
            action,
          },
          { headers: corsHeaders },
        );
      } catch (err) {
        const msg = err instanceof Error
          ? err.message
          : "Son fatura getirilemedi.";
        const failText = `Son fatura alınamadı: ${msg}`;
        await supabase.from("messages").insert({
          conversation_id: cid,
          role: "assistant",
          content: failText,
        });
        return Response.json(
          { message: failText, conversationId: cid, action: null },
          { headers: corsHeaders },
        );
      }
    }

    if (
      hasMessage &&
      !isConfirmMessage &&
      !isConfirmAction &&
      isInvoiceListIntent(message ?? "") &&
      !skipFinanceFastPaths
    ) {
      try {
        const msgDir = parseInvoiceListDirection({}, message ?? "");
        const toolInput: Record<string, unknown> = { direction: msgDir };
        const result = await executeTool(
          supabase,
          "list_invoices",
          toolInput,
          session,
          message ?? "",
          cid,
          { source: "fast_path" },
        );
        const list = normalizeInvoiceListToolResult(result);
        const directMessage = formatInvoiceListChatSummary(list);
        const action = buildPrimaryInvoicesAction(
          message ?? "",
          toolInput,
          list,
        );
        const persistDirection = list.direction === "incoming" ||
            list.direction === "outgoing"
          ? list.direction
          : list.incoming && list.outgoing
          ? (list.outgoing.count >= list.incoming.count
            ? "outgoing"
            : "incoming")
          : "outgoing";
        await persistChatContext(supabase, cid, {
          last_tool: "list_invoices",
          last_direction: persistDirection,
          last_date_range: list.start_date && list.end_date
            ? { startDate: list.start_date, endDate: list.end_date }
            : undefined,
        });
        await supabase.from("messages").insert({
          conversation_id: cid,
          role: "assistant",
          content: directMessage,
          action_snapshot: persistableAction(action),
        });
        return Response.json(
          {
            message: directMessage,
            conversationId: cid,
            action,
          },
          { headers: corsHeaders },
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Faturalar getirilemedi.";
        const failText = `Fatura listesi alınamadı: ${msg}`;
        await supabase.from("messages").insert({
          conversation_id: cid,
          role: "assistant",
          content: failText,
        });
        return Response.json(
          { message: failText, conversationId: cid, action: null },
          { headers: corsHeaders },
        );
      }
    }

    const claudeMessages = await loadAgentChatHistory(supabase, cid);

    const stableUserMsg = typeof message === "string" ? message : "";
    const dynamicSystemPrompt = await buildDynamicSystemPromptForAgent(
      supabase,
      cid,
    );

    const wantsNdjson =
      clientWantsNdjsonStream(req, body) &&
      typeof message === "string" &&
      message.trim().length > 0;

    async function runAgentFinalizeAndPersist(
      msgs: Anthropic.MessageParam[],
    ): Promise<{ finalAssistant: string; action: ChatAction | null }> {
      try {
        const acc = await runAnthropicToolLoop(
          supabase,
          msgs,
          session,
          stableUserMsg,
          cid,
          dynamicSystemPrompt,
          null,
        );
        const fin = await finalizeAgentAssistant(supabase, {
          convId: cid,
          session,
          userMessage: stableUserMsg,
          assistantText: acc.assistantText,
          usedFinanceTool: acc.usedFinanceTool,
          usedToolNames: acc.usedToolNames,
          latestInvoiceActionPayload: acc.latestInvoiceActionPayload,
          lastListInvoicesInput: acc.lastListInvoicesInput,
          lastListInvoicesResult: acc.lastListInvoicesResult,
          lastExportExcelPayload: acc.lastExportExcelPayload,
        });
        await supabase.from("messages").insert({
          conversation_id: cid,
          role: "assistant",
          content: fin.finalAssistant,
          action_snapshot: persistableAction(fin.action),
        });
        return fin;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Beklenmeyen bir hata oluştu.";
        const failText = `Yanıt oluşturulamadı: ${msg}`;
        await supabase.from("messages").insert({
          conversation_id: cid,
          role: "assistant",
          content: failText,
        });
        return { finalAssistant: failText, action: null };
      }
    }

    if (!wantsNdjson) {
      const fin = await runAgentFinalizeAndPersist(claudeMessages);
      return Response.json(
        {
          message: fin.finalAssistant,
          conversationId: cid,
          action: fin.action,
        },
        { headers: corsHeaders },
      );
    }

    const { readable, writable } = new TransformStream<
      Uint8Array,
      Uint8Array
    >();
    const ndWriter = writable.getWriter();

    void (async () => {
      try {
        await ndWriter.write(
          encodeNdjsonEvent({ type: "meta", conversationId: cid }),
        );

        const msgs = [...claudeMessages];
        const acc = await runAnthropicToolLoop(
          supabase,
          msgs,
          session,
          stableUserMsg,
          cid,
          dynamicSystemPrompt,
          ndWriter,
        );

        const fin = await finalizeAgentAssistant(supabase, {
          convId: cid,
          session,
          userMessage: stableUserMsg,
          assistantText: acc.assistantText,
          usedFinanceTool: acc.usedFinanceTool,
          usedToolNames: acc.usedToolNames,
          latestInvoiceActionPayload: acc.latestInvoiceActionPayload,
          lastListInvoicesInput: acc.lastListInvoicesInput,
          lastListInvoicesResult: acc.lastListInvoicesResult,
          lastExportExcelPayload: acc.lastExportExcelPayload,
        });

        await supabase.from("messages").insert({
          conversation_id: cid,
          role: "assistant",
          content: fin.finalAssistant,
          action_snapshot: persistableAction(fin.action),
        });

        await ndWriter.write(
          encodeNdjsonEvent({
            type: "done",
            message: fin.finalAssistant,
            conversationId: cid,
            action: fin.action,
          }),
        );
      } catch (e) {
        console.error("chat ndjson stream failed", e);
        const msg =
          e instanceof Error ? e.message : "Beklenmeyen bir hata oluştu.";
        const failText = `Yanıt oluşturulamadı: ${msg}`;
        try {
          await supabase.from("messages").insert({
            conversation_id: cid,
            role: "assistant",
            content: failText,
          });
        } catch {
          /* ignore persist failure */
        }
        try {
          await ndWriter.write(
            encodeNdjsonEvent({ type: "error", message: failText }),
          );
        } catch {
          /* client disconnected */
        }
      } finally {
        try {
          await ndWriter.close();
        } catch {
          /* */
        }
      }
    })();

    return new Response(readable, {
      headers: {
        ...corsHeaders,
        "Content-Type": NDJSON_CONTENT_TYPE,
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    if (err instanceof SessionAuthError) {
      return Response.json(
        { error: err.message },
        { status: err.status, headers: corsHeaders },
      );
    }
    console.error(err);
    const message =
      err instanceof Error ? err.message : "Beklenmeyen bir hata oluştu.";
    return Response.json({ error: message }, { status: 500, headers: corsHeaders });
  }
});
