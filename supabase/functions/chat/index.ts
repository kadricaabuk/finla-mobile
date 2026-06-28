import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { buildPendingDraftPreviewAction, loadPendingInvoice } from "../_shared/invoice-workflow.ts";
import {
  getSubjectFromAuthHeader,
  SessionAuthError,
} from "../_shared/session-auth.ts";
import {
  buildDynamicSystemPromptForAgent,
  runAnthropicToolLoop,
} from "./agent-loop.ts";
import { finalizeAgentAssistant } from "./finalize.ts";
import { isDraftPreviewIntent } from "./intents.ts";
import {
  clientWantsNdjsonStream,
  encodeNdjsonEvent,
  NDJSON_CONTENT_TYPE,
} from "./ndjson-stream.ts";
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
    const username = await getSubjectFromAuthHeader(req);
    const body = await req.json() as {
      message?: string;
      conversationId?: string | null;
      action?: {
        type?: string;
        draftUuid?: string;
        smsCode?: string;
        phone?: string;
      };
      stream?: boolean;
    };
    const { message, conversationId, action: requestAction } = body;

    const hasMessage = typeof message === "string" && message.trim().length > 0;
    const hasAction = !!requestAction;
    if (!username || (!hasMessage && !hasAction)) {
      return Response.json(
        { error: "message zorunludur." },
        { headers: corsHeaders },
      );
    }

    let convId = conversationId;
    if (!convId) {
      const { data: conv, error } = await supabase
        .from("conversations")
        .insert({
          gib_username: username,
          title: String(message ?? "").slice(0, 60),
        })
        .select("id")
        .single();
      if (error) throw error;
      convId = conv.id;
    }

    if (typeof convId !== "string") {
      return Response.json(
        { error: "conversation id gerekli." },
        { headers: corsHeaders },
      );
    }

    const cid = convId;

    await supabase.from("messages").insert({
      conversation_id: cid,
      role: "user",
      content: hasMessage ? message : "[action]",
    });

    const normalizedMessage = String(message ?? "")
      .toLocaleLowerCase("tr-TR")
      .trim();
    const isConfirmMessage =
      /\b(onayliyorum|onaylıyorum)\b/.test(normalizedMessage) ||
      /\bevet\s+onay\b/.test(normalizedMessage);
    const isConfirmAction = requestAction?.type === "confirm_pending_invoice";
    const isRequestOtpAction = requestAction?.type === "request_sign_otp";
    const isVerifyOtpAction = requestAction?.type === "verify_sign_otp";

    if (isVerifyOtpAction) {
      const pending = await loadPendingInvoice(supabase, cid);
      if (pending?.draft?.date && pending?.draft?.uuid) {
        if (
          typeof requestAction?.draftUuid === "string" &&
          requestAction.draftUuid !== pending.draft.uuid
        ) {
          const mismatchMsg =
            "Doğrulanacak taslak değişmiş görünüyor. Lütfen en son önizleme kartını kullan.";
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
          await executeTool(
            supabase,
            "verify_invoice_sign_otp",
            { code: requestAction?.smsCode },
            username,
            message ?? "",
            cid,
            { source: "fast_path" },
          );
          const result = await executeTool(
            supabase,
            "confirm_invoice_issue",
            {},
            username,
            message ?? "",
            cid,
            { source: "fast_path" },
          );
          const payload = result as { uuid?: string; message?: string };
          const directMessage = payload?.uuid
            ? `SMS doğrulaması tamamlandı, fatura başarıyla kesildi.\n\nETTN: ${payload.uuid}\n\nİstersen şimdi "faturayı gör" veya "indir" diyebilirsin.`
            : (payload?.message ??
              "SMS doğrulaması tamamlandı, fatura kesildi.");

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
          const msg =
            err instanceof Error ? err.message : "SMS doğrulaması başarısız.";
          const failText = `SMS doğrulaması başarısız oldu: ${msg}. Kodu kontrol edip tekrar deneyebilirsin.`;
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
    }

    if (
      hasMessage &&
      !isConfirmMessage &&
      !isConfirmAction &&
      !isRequestOtpAction &&
      !isVerifyOtpAction &&
      isDraftPreviewIntent(message ?? "")
    ) {
      const pending = await loadPendingInvoice(supabase, cid);
      if (pending?.draft?.uuid) {
        const previewAction = await buildPendingDraftPreviewAction(
          username,
          pending,
        );
        const directMessage = previewAction
          ? "Taslak faturanı önizlemede açtım. Kontrol et; uygunsa onayla ve imzalamaya geç."
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
    }

    if (isConfirmMessage || isConfirmAction || isRequestOtpAction) {
      const pending = await loadPendingInvoice(supabase, cid);
      if (pending?.draft?.date && pending?.draft?.uuid) {
        if (
          (isConfirmAction || isRequestOtpAction) &&
          typeof requestAction?.draftUuid === "string" &&
          requestAction.draftUuid !== pending.draft.uuid
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
            "request_invoice_sign_otp",
            { phone: requestAction?.phone },
            username,
            message ?? "",
            cid,
            { source: "fast_path" },
          );
          const payload = result as {
            status?: string;
            draft_uuid?: string;
            phone_masked?: string;
          };
          const directMessage =
            payload?.status === "phone_required"
              ? "İmzalama için telefon numarası gerekli. Numaranı girip SMS kodunu isteyebilirsin."
              : `İmzalama için SMS doğrulama bekleniyor.${payload?.phone_masked ? ` Kod ${payload.phone_masked} numarasına gönderildi.` : ""}`;

          await supabase.from("messages").insert({
            conversation_id: cid,
            role: "assistant",
            content: directMessage,
          });

          return Response.json(
            {
              message: directMessage,
              conversationId: cid,
              action: payload?.draft_uuid
                ? {
                    type: "open_sign_otp",
                    label: "SMS Doğrulama",
                    sign_otp: {
                      draftUuid: payload.draft_uuid,
                      phoneMasked: payload.phone_masked ?? "Kayıtlı numara",
                    },
                  } satisfies ChatAction
                : null,
            },
            { headers: corsHeaders },
          );
        } catch (err) {
          const msg =
            err instanceof Error
              ? err.message
              : "SMS doğrulaması başlatılamadı.";
          const failText = `İmzalama adımı başlatılamadı: ${msg}`;
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
    }

    const { data: history } = await supabase
      .from("messages")
      .select("role, content")
      .eq("conversation_id", cid)
      .order("created_at", { ascending: true })
      .limit(20);

    const claudeMessages: Anthropic.MessageParam[] = (history ?? []).map(
      (m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }),
    );

    const stableUserMsg = typeof message === "string" ? message : "";
    const dynamicSystemPrompt = buildDynamicSystemPromptForAgent();

    const wantsNdjson =
      clientWantsNdjsonStream(req, body) &&
      typeof message === "string" &&
      message.trim().length > 0;

    async function runAgentFinalizeAndPersist(
      msgs: Anthropic.MessageParam[],
    ): Promise<{ finalAssistant: string; action: ChatAction | null }> {
      const acc = await runAnthropicToolLoop(
        supabase,
        msgs,
        username,
        stableUserMsg,
        cid,
        dynamicSystemPrompt,
        null,
      );
      const fin = await finalizeAgentAssistant(supabase, {
        convId: cid,
        username,
        userMessage: stableUserMsg,
        assistantText: acc.assistantText,
        usedFinanceTool: acc.usedFinanceTool,
        usedToolNames: acc.usedToolNames,
        latestInvoiceActionPayload: acc.latestInvoiceActionPayload,
        lastListInvoicesInput: acc.lastListInvoicesInput,
        lastExportExcelPayload: acc.lastExportExcelPayload,
      });
      await supabase.from("messages").insert({
        conversation_id: cid,
        role: "assistant",
        content: fin.finalAssistant,
        action_snapshot: persistableAction(fin.action),
      });
      return fin;
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
          username,
          stableUserMsg,
          cid,
          dynamicSystemPrompt,
          ndWriter,
        );

        const fin = await finalizeAgentAssistant(supabase, {
          convId: cid,
          username,
          userMessage: stableUserMsg,
          assistantText: acc.assistantText,
          usedFinanceTool: acc.usedFinanceTool,
          usedToolNames: acc.usedToolNames,
          latestInvoiceActionPayload: acc.latestInvoiceActionPayload,
          lastListInvoicesInput: acc.lastListInvoicesInput,
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
        try {
          await ndWriter.write(
            encodeNdjsonEvent({ type: "error", message: msg }),
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
    return Response.json({ error: message }, { headers: corsHeaders });
  }
});
