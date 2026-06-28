import type { SupabaseClient } from "npm:@supabase/supabase-js";
import type { ChatAction } from "./chat-types.ts";
import { gibGetInvoicePreview } from "./gib.ts";
import {
  buildLocalPreviewFromRequest,
  type InvoicePreviewContent,
} from "./invoice-preview.ts";
import { buildLocalDraftPreviewHtml } from "./invoice-mapper.ts";

export type PendingInvoiceStatus =
  | "exchange_rate_pending"
  | "preview_ready"
  | "otp_pending"
  | "issued";

export interface PendingInvoiceState {
  status?: PendingInvoiceStatus;
  draft?: { date?: string; uuid?: string };
  request?: {
    buyer_name?: string;
    buyer_tax_id?: string;
    buyer_address?: string;
    items?: {
      name?: string;
      quantity?: number;
      unit?: string;
      unit_price?: number;
      vat_rate?: number;
    }[];
    currency?: string;
    date?: string;
    exchange_rate?: string;
  };
  exchange_rate_quote?: {
    currency: string;
    rate: string;
    rate_date: string;
    source: string;
    rate_type: string;
  };
  preview_html?: string;
  signing?: {
    status?: "idle" | "otp_sent" | "otp_verified";
    phone?: string;
    phone_masked?: string;
    operation_id?: string;
    otp_requested_at?: string;
    otp_verified_at?: string;
  };
  created_at?: string;
}

export async function loadPendingInvoice(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<PendingInvoiceState | null> {
  const { data, error } = await supabase
    .from("conversations")
    .select("pending_invoice")
    .eq("id", conversationId)
    .single();
  if (error) throw error;
  return (data?.pending_invoice as PendingInvoiceState | null) ?? null;
}

export async function savePendingInvoice(
  supabase: SupabaseClient,
  conversationId: string,
  pending: PendingInvoiceState | null,
): Promise<void> {
  const { error } = await supabase
    .from("conversations")
    .update({ pending_invoice: pending })
    .eq("id", conversationId);
  if (error) throw error;
}

export function hasActiveDraft(pending: PendingInvoiceState | null): boolean {
  return !!(
    pending?.draft?.uuid &&
    (pending.status === "preview_ready" || pending.status === "otp_pending")
  );
}

export async function fetchInvoicePreview(
  username: string,
  uuid: string,
  signed: boolean,
  draftDate?: string,
  localRequest?: PendingInvoiceState["request"],
): Promise<InvoicePreviewContent> {
  try {
    return await gibGetInvoicePreview(username, uuid, signed, draftDate);
  } catch (err) {
    if (localRequest) {
      return buildLocalPreviewFromRequest(localRequest);
    }
    throw err;
  }
}

export async function buildPendingDraftPreviewAction(
  username: string,
  pending: PendingInvoiceState,
): Promise<ChatAction | null> {
  const uuid = pending.draft?.uuid;
  const draftDate = pending.draft?.date;
  if (!uuid) return null;

  let html =
    typeof pending.preview_html === "string" ? pending.preview_html : "";
  let pdfBase64: string | undefined;

  if (!html.length) {
    try {
      const preview = await fetchInvoicePreview(
        username,
        uuid,
        false,
        draftDate,
        pending.request,
      );
      html = preview.html ?? "";
      pdfBase64 = preview.pdfBase64;
      if (!html.length && preview.local_fallback && pending.request) {
        html = buildLocalDraftPreviewHtml(pending.request);
      }
    } catch (err) {
      console.error("buildPendingDraftPreviewAction preview failed", err);
      if (pending.request) {
        html = buildLocalDraftPreviewHtml(pending.request);
      }
    }
  }

  return {
    type: "open_invoice_preview",
    label: "Taslağı Gör",
    preview: {
      title: "Taslak Fatura Önizleme",
      ...(html.length > 0 ? { html } : {}),
      ...(pdfBase64 ? { pdfBase64 } : {}),
      uuid,
      ...(draftDate ? { draftDate } : {}),
      issued: false,
    },
  };
}
