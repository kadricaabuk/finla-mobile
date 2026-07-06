import type { SupabaseClient } from "npm:@supabase/supabase-js";
import type { ChatAction } from "./chat-types.ts";
import type { FinlaSession } from "./session-auth.ts";
import type { CreateInvoiceInput } from './invoice-mapper.ts'
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
    buyer_country?: string;
    buyer_city?: string;
    tax_office?: string;
    items?: {
      name?: string;
      quantity?: number;
      unit?: string;
      unit_price?: number;
      vat_rate?: number;
      vat_exemption_code?: string;
      withholding_code?: string;
      discount_rate?: number;
      discount_amount?: number;
    }[];
    currency?: string;
    date?: string;
    due_date?: string;
    note?: string;
    return_ref_invoice_no?: string;
    return_ref_invoice_date?: string;
    return_reason?: string;
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

/** Onay/kesim için geçerli taslak ETTN + tarih (draft.date yoksa request.date). */
export function resolvePendingDraftRef(
  pending: PendingInvoiceState | null,
): { uuid: string; date: string } | null {
  const uuid = pending?.draft?.uuid?.trim();
  const date =
    pending?.draft?.date?.trim() || pending?.request?.date?.trim() || "";
  if (!uuid || !date) return null;
  return { uuid, date };
}

/** UI «Onayla ve Kes» fast-path — yalnızca önizlemeye hazır taslak varken. */
export function canFastPathConfirmInvoiceIssue(
  pending: PendingInvoiceState | null,
): boolean {
  if (pending?.status !== "preview_ready") return false;
  return resolvePendingDraftRef(pending) !== null;
}

/** Fatura oluşturma / kur onayı devam ederken finans fast-path'lerini atla. */
export function shouldSkipFinanceFastPaths(
  pending: PendingInvoiceState | null,
): boolean {
  if (!pending) return false;
  if (
    pending.status === "exchange_rate_pending" ||
    pending.status === "otp_pending"
  ) {
    return true;
  }
  if (pending.request && !pending.draft?.uuid?.trim()) return true;
  return false;
}

/** Agent system prompt — bekleyen fatura adımı özeti. */
export function formatPendingInvoiceForPrompt(
  pending: PendingInvoiceState | null,
): string {
  if (!pending?.status) return "";

  const lines: string[] = [];
  switch (pending.status) {
    case "exchange_rate_pending": {
      const q = pending.exchange_rate_quote;
      const buyer = pending.request?.buyer_name?.trim();
      if (q) {
        lines.push(
          `Döviz kuru onayı bekleniyor: 1 ${q.currency} = ${q.rate} TL (${q.rate_date}, ${q.source}).`,
        );
      } else {
        lines.push("Döviz kuru onayı bekleniyor.");
      }
      if (buyer) lines.push(`Alıcı: ${buyer}.`);
      lines.push(
        "Kullanıcı onaylarsa create_invoice aracını pending.request ile aynı parametreler + onaylanan exchange_rate ile tekrar çağır.",
      );
      break;
    }
    case "preview_ready": {
      const ref = resolvePendingDraftRef(pending);
      const buyer = pending.request?.buyer_name?.trim();
      lines.push("Taslak fatura önizlemeye hazır; kesim onayı bekleniyor.");
      if (pending.request?.return_ref_invoice_no?.trim()) {
        lines.push(
          `Bu bir İADE faturası (referans: ${pending.request.return_ref_invoice_no.trim()}).`,
        );
      }
      if (buyer) lines.push(`Alıcı: ${buyer}.`);
      if (ref) lines.push(`Taslak ETTN: ${ref.uuid}.`);
      lines.push(
        "Metin onayı gelirse confirm_invoice_issue çağır; UI «Onayla ve Kes» zaten sunucu fast-path kullanır.",
      );
      lines.push(
        "Kullanıcı taslakta değişiklik isterse create_invoice'u replace_existing_draft=true ve güncel parametrelerle çağır (eski taslak silinir); taslağı iptal etmek isterse cancel_invoice çağır. Taslak silinemez deme.",
      );
      break;
    }
    case "otp_pending":
      lines.push(
        "Eski SMS imza adımı artık gerekmiyor; confirm_invoice_issue kullan.",
      );
      break;
    default:
      break;
  }

  if (lines.length === 0) return "";
  return `\n\nBekleyen fatura işlemi: ${lines.join(" ")}`;
}

/** pending_invoice.request → Mysoft yeniden gönderim için CreateInvoiceInput */
export function pendingRequestToCreateInput(
  pending: PendingInvoiceState | null,
): CreateInvoiceInput | null {
  const r = pending?.request;
  if (!r?.buyer_name?.trim() || !Array.isArray(r.items) || r.items.length === 0) {
    return null;
  }

  const items = r.items
    .filter(
      (i) =>
        typeof i.name === "string" &&
        i.name.trim() &&
        typeof i.quantity === "number" &&
        typeof i.unit_price === "number" &&
        typeof i.vat_rate === "number",
    )
    .map((i) => ({
      name: i.name!.trim(),
      quantity: i.quantity!,
      unit: typeof i.unit === "string" && i.unit.trim() ? i.unit.trim() : "adet",
      unitPrice: i.unit_price!,
      vatRate: i.vat_rate!,
      vatExemptionCode: i.vat_exemption_code?.trim() || undefined,
      withholdingCode: i.withholding_code?.trim() || undefined,
      discountRate:
        typeof i.discount_rate === "number" ? i.discount_rate : undefined,
      discountAmount:
        typeof i.discount_amount === "number" ? i.discount_amount : undefined,
    }));

  if (items.length === 0) return null;

  return {
    buyerName: r.buyer_name.trim(),
    buyerTaxId: r.buyer_tax_id?.trim() || undefined,
    buyerAddress: r.buyer_address?.trim() || undefined,
    buyerCountry: r.buyer_country?.trim() || undefined,
    buyerCity: r.buyer_city?.trim() || undefined,
    taxOffice: r.tax_office?.trim() || undefined,
    items,
    date: pending?.draft?.date?.trim() || r.date?.trim() || undefined,
    dueDate: r.due_date?.trim() || undefined,
    note: r.note?.trim() || undefined,
    returnRef: r.return_ref_invoice_no?.trim()
      ? {
        invoiceNo: r.return_ref_invoice_no.trim().toUpperCase(),
        invoiceDate: r.return_ref_invoice_date?.trim() || "",
        reason: r.return_reason?.trim() || undefined,
      }
      : undefined,
    currency: (r.currency?.trim().toUpperCase() || "TRY") as "TRY" | "USD" | "EUR",
    currencyRate: r.exchange_rate?.trim() || undefined,
  };
}

export async function fetchInvoicePreview(
  _session: FinlaSession,
  _uuid: string,
  _signed: boolean,
  _draftDate?: string,
  localRequest?: PendingInvoiceState["request"],
): Promise<InvoicePreviewContent> {
  if (localRequest) {
    return buildLocalPreviewFromRequest(localRequest);
  }
  throw new Error("Önizleme için taslak verisi bulunamadı.");
}

export async function buildPendingDraftPreviewAction(
  _session: FinlaSession,
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
        _session,
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
