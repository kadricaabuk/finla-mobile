import type { SupabaseClient } from "npm:@supabase/supabase-js";
import { faturaGetInvoiceHtml } from "../_shared/gib.ts";
import { parseAmount } from "../_shared/invoice-facts.ts";
import { buildPendingDraftPreviewAction } from "../_shared/invoice-workflow.ts";
import { getUserProfile } from "../_shared/profile-service.ts";
import { normalizeTurkish } from "../_shared/turkish.ts";
import type { AgentLoopAccumulator } from "./agent-loop.ts";
import { resolveDateRange } from "./date-range.ts";
import {
  isUserProfileIntent,
  parseFiltersFromText,
  shouldOfferInvoicesAction,
  summarizeUserProfile,
  wantsInvoicePreviewOrDownload,
} from "./intents.ts";
import { assistantFallbackForAction } from "./persist-action.ts";
import type { ChatAction, InvoiceDetailPayload, PendingInvoiceState } from "./types.ts";

export async function finalizeAgentAssistant(
  supabase: SupabaseClient,
  opts: {
    convId: string;
    username: string;
    userMessage: string;
    assistantText: string;
    usedFinanceTool: boolean;
    usedToolNames: Set<string>;
    latestInvoiceActionPayload: InvoiceDetailPayload | null;
    lastListInvoicesInput: Record<string, unknown> | null;
    lastExportExcelPayload: AgentLoopAccumulator["lastExportExcelPayload"];
  },
): Promise<{ finalAssistant: string; action: ChatAction | null }> {
  const {
    convId,
    username,
    userMessage,
    assistantText,
    usedFinanceTool,
    usedToolNames,
    latestInvoiceActionPayload,
    lastListInvoicesInput,
    lastExportExcelPayload,
  } = opts;

  let trimmedAssistant = assistantText;
  if (
    !usedToolNames.has("get_user_profile") &&
    isUserProfileIntent(userMessage)
  ) {
    try {
      const profile = await getUserProfile(username);
      trimmedAssistant = summarizeUserProfile(profile);
      usedToolNames.add("get_user_profile");
    } catch {
      // Allow the normal model answer when profile fetch fails.
    }
  }

  if (trimmedAssistant && usedFinanceTool) {
    trimmedAssistant = trimmedAssistant
      .replace(/\n{3,}/g, "\n\n")
      .replace(/\*\*(İstek|Sonuç|Tarih Aralığı|Sonraki Adım):\*\*/g, "")
      .trim();
  }

  const latestInvSnap =
    latestInvoiceActionPayload as InvoiceDetailPayload | null;
  if (usedToolNames.has("latest_invoice") && latestInvSnap?.invoice_uuid) {
    await supabase
      .from("conversations")
      .update({
        last_invoice: {
          uuid: latestInvSnap.invoice_uuid,
          issue_date: latestInvSnap.issue_date,
          status: latestInvSnap.status,
          currency: latestInvSnap.currency,
          gross_total: latestInvSnap.gross_total,
          vat_total: latestInvSnap.vat_total,
          net_total: latestInvSnap.net_total,
          customer_tax_id: latestInvSnap.customer_tax_id,
          customer_name: latestInvSnap.customer_name,
        },
      })
      .eq("id", convId);
  }

  const { data: convState } = await supabase
    .from("conversations")
    .select("pending_invoice,last_invoice")
    .eq("id", convId)
    .single();
  const pending = convState?.pending_invoice as PendingInvoiceState | null;
  const last = convState?.last_invoice as {
    uuid?: string;
    html?: string;
    issue_date?: string;
    status?: string;
    currency?: string;
    gross_total?: number;
    vat_total?: number;
    net_total?: number;
    customer_tax_id?: string;
    customer_name?: string;
  } | null;

  let action: ChatAction | null = null;
  if (
    lastExportExcelPayload &&
    usedToolNames.has("export_invoices_excel")
  ) {
    action = {
      type: "open_excel_export",
      label: `Excel indir (${lastExportExcelPayload.row_count} fatura)`,
      excel_export: {
        download_url: lastExportExcelPayload.download_url,
        file_name: lastExportExcelPayload.file_name,
        row_count: lastExportExcelPayload.row_count,
        expires_in_seconds: lastExportExcelPayload.expires_in_seconds,
      },
    };
  }

  const wantsPreviewOrDownload = wantsInvoicePreviewOrDownload(
    String(userMessage ?? ""),
  );
  if (
    !action &&
    (wantsPreviewOrDownload || usedToolNames.has("create_invoice"))
  ) {
    if (pending?.draft?.uuid) {
      action = await buildPendingDraftPreviewAction(username, pending);
    } else if (last?.uuid) {
      try {
        const statusLower =
          typeof last.status === "string" ? last.status.toLowerCase() : "";
        const useSignedHtml =
          statusLower.includes("approved") || statusLower.includes("onay");
        const html =
          typeof last.html === "string" && last.html.length > 0
            ? last.html
            : await faturaGetInvoiceHtml(username, last.uuid, useSignedHtml);
        action = {
          type: "open_invoice_preview",
          label: "Faturayi PDF Ac",
          preview: {
            title: useSignedHtml ? "Kesilmiş Fatura" : "Taslak / Önizleme",
            html,
            uuid: last.uuid,
            issued: useSignedHtml,
          },
        };
      } catch (err) {
        console.error("last_invoice preview html failed", err);
      }
    } else if (latestInvSnap?.invoice_uuid) {
      try {
        const inv = latestInvSnap;
        const issued = inv.status === "approved";
        const html = await faturaGetInvoiceHtml(
          username,
          inv.invoice_uuid,
          issued,
        );
        action = {
          type: "open_invoice_preview",
          label: issued ? "Faturayi Gor" : "Taslagi Gor",
          preview: {
            title: issued ? "Kesilmiş Fatura" : "Taslak Fatura Önizleme",
            html,
            uuid: inv.invoice_uuid,
            issued,
          },
        };
      } catch (err) {
        console.error("latest_invoice preview html failed", err);
      }
    }
  } else if (!action && latestInvSnap?.invoice_uuid) {
    let detail: InvoiceDetailPayload = latestInvSnap;
    if (
      last?.uuid &&
      detail.invoice_uuid === last.uuid &&
      (detail.gross_total === null || detail.vat_total === null)
    ) {
      detail = {
        ...detail,
        issue_date: detail.issue_date ?? last.issue_date ?? null,
        status: detail.status || last.status || "approved",
        currency: detail.currency || last.currency || "TRY",
        gross_total: detail.gross_total ?? last.gross_total ?? null,
        vat_total: detail.vat_total ?? last.vat_total ?? null,
        net_total: detail.net_total ?? last.net_total ?? null,
        customer_tax_id:
          detail.customer_tax_id ?? last.customer_tax_id ?? null,
        customer_name: detail.customer_name ?? last.customer_name ?? null,
      };
    }
    action = {
      type: "open_invoice_detail",
      label: "Detayi Gor",
      invoice: detail,
    };
  } else if (!action && shouldOfferInvoicesAction(userMessage, usedToolNames)) {
    const listInput = lastListInvoicesInput ?? {};
    const parsedRange = resolveDateRange(
      listInput,
      userMessage,
      "month",
    );
    const msgFilters = parseFiltersFromText(userMessage);
    const toolAmountGte =
      typeof listInput.amount_gte === "number"
        ? listInput.amount_gte
        : typeof listInput.amount_gte === "string"
          ? parseAmount(listInput.amount_gte as string)
          : null;
    const toolAmountEq =
      typeof listInput.amount_eq === "number"
        ? listInput.amount_eq
        : typeof listInput.amount_eq === "string"
          ? parseAmount(listInput.amount_eq as string)
          : null;
    const toolCustomerName =
      typeof listInput.customer_name === "string" &&
        listInput.customer_name.trim()
        ? listInput.customer_name.trim()
        : undefined;
    if (parsedRange) {
      action = {
        type: "open_invoices",
        label: "Faturalari Gor",
        filter: {
          ...parsedRange,
          customerName: toolCustomerName ?? msgFilters.customerName,
          amountGte: toolAmountGte ?? msgFilters.amountGte,
          amountEq: toolAmountEq ?? msgFilters.amountEq,
          direction: "outgoing",
        },
      };
    }
  }

  let finalAssistant = (trimmedAssistant || "").trim();
  if (!finalAssistant) {
    finalAssistant =
      assistantFallbackForAction(action) ||
      (usedToolNames.size > 0
        ? "İşlem tamam."
        : "Şu an yanıt oluşturamadım — ne yapmak istediğini tek cümleyle yazar mısın?");
  }

  return { finalAssistant, action };
}
