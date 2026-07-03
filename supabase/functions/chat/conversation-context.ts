import type { SupabaseClient } from "npm:@supabase/supabase-js";
import type { ChatAction, InvoiceDetailPayload } from "./types.ts";
import type { InvoiceDirection } from "../_shared/invoice-facts.ts";

export type StoredLastInvoice = {
  uuid: string;
  direction?: InvoiceDirection;
  issue_date?: string | null;
  status?: string;
  currency?: string;
  gross_total?: number | null;
  vat_total?: number | null;
  net_total?: number | null;
  customer_tax_id?: string | null;
  customer_name?: string | null;
  html?: string;
};

export type ChatContext = {
  last_direction?: InvoiceDirection;
  last_date_range?: { startDate: string; endDate: string };
  last_counterparty?: string;
  last_tool?: string;
};

export function invoiceDetailToStoredLast(
  invoice: InvoiceDetailPayload,
): StoredLastInvoice {
  return {
    uuid: invoice.invoice_uuid,
    direction: invoice.direction ?? "outgoing",
    issue_date: invoice.issue_date,
    status: invoice.status,
    currency: invoice.currency,
    gross_total: invoice.gross_total,
    vat_total: invoice.vat_total,
    net_total: invoice.net_total,
    customer_tax_id: invoice.customer_tax_id,
    customer_name: invoice.customer_name,
  };
}

export async function persistLastInvoice(
  supabase: SupabaseClient,
  conversationId: string,
  invoice: InvoiceDetailPayload,
): Promise<void> {
  const { error } = await supabase
    .from("conversations")
    .update({ last_invoice: invoiceDetailToStoredLast(invoice) })
    .eq("id", conversationId);
  if (error) console.error("persistLastInvoice failed", error);
}

export async function loadStoredLastInvoice(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<StoredLastInvoice | null> {
  const { data, error } = await supabase
    .from("conversations")
    .select("last_invoice")
    .eq("id", conversationId)
    .maybeSingle();
  if (error || !data?.last_invoice) return null;
  const raw = data.last_invoice as Record<string, unknown>;
  const uuid = typeof raw.uuid === "string" ? raw.uuid.trim() : "";
  if (!uuid) return null;
  const direction =
    raw.direction === "incoming" || raw.direction === "outgoing"
      ? raw.direction
      : "outgoing";
  return {
    uuid,
    direction,
    issue_date: typeof raw.issue_date === "string" ? raw.issue_date : null,
    status: typeof raw.status === "string" ? raw.status : undefined,
    currency: typeof raw.currency === "string" ? raw.currency : undefined,
    gross_total:
      typeof raw.gross_total === "number" ? raw.gross_total : null,
    vat_total: typeof raw.vat_total === "number" ? raw.vat_total : null,
    net_total: typeof raw.net_total === "number" ? raw.net_total : null,
    customer_tax_id:
      typeof raw.customer_tax_id === "string" ? raw.customer_tax_id : null,
    customer_name:
      typeof raw.customer_name === "string" ? raw.customer_name : null,
    html: typeof raw.html === "string" ? raw.html : undefined,
  };
}

export function buildIssuedInvoicePreviewAction(
  last: StoredLastInvoice,
  label = "Faturayı Gör",
): ChatAction {
  const direction: InvoiceDirection = last.direction ?? "outgoing";
  const status = (last.status ?? "").toLocaleLowerCase("tr-TR");
  const isDraft =
    status.includes("draft") || status.includes("taslak") || status === "pending";
  const issued =
    direction === "incoming"
      ? !isDraft &&
        (status.includes("accepted") ||
          status.includes("kabul") ||
          status.includes("approved") ||
          status.includes("onay") ||
          !status.trim())
      : !isDraft &&
        (status.includes("approved") ||
          status.includes("onay") ||
          status.includes("issued") ||
          status.includes("kesil") ||
          !status.trim());
  const title = last.customer_name?.trim()
    ? `Fatura — ${last.customer_name.trim()}`
    : direction === "incoming"
      ? "Gelen Fatura"
      : issued
        ? "Kesilmiş Fatura"
        : "Taslak Fatura";
  return {
    type: "open_invoice_preview",
    label,
    preview: {
      title,
      uuid: last.uuid,
      issued,
      direction,
      html: last.html,
    },
  };
}

export async function loadChatContext(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<ChatContext | null> {
  const { data, error } = await supabase
    .from("conversations")
    .select("chat_context")
    .eq("id", conversationId)
    .maybeSingle();
  if (error || !data?.chat_context) return null;
  const raw = data.chat_context as Record<string, unknown>;
  const ctx: ChatContext = {};
  if (raw.last_direction === "incoming" || raw.last_direction === "outgoing") {
    ctx.last_direction = raw.last_direction;
  }
  if (raw.last_date_range && typeof raw.last_date_range === "object") {
    const r = raw.last_date_range as Record<string, unknown>;
    if (
      typeof r.startDate === "string" &&
      typeof r.endDate === "string"
    ) {
      ctx.last_date_range = {
        startDate: r.startDate,
        endDate: r.endDate,
      };
    }
  }
  if (typeof raw.last_counterparty === "string" && raw.last_counterparty.trim()) {
    ctx.last_counterparty = raw.last_counterparty.trim();
  }
  if (typeof raw.last_tool === "string" && raw.last_tool.trim()) {
    ctx.last_tool = raw.last_tool.trim();
  }
  return Object.keys(ctx).length > 0 ? ctx : null;
}

export async function persistChatContext(
  supabase: SupabaseClient,
  conversationId: string,
  patch: ChatContext,
): Promise<void> {
  const existing = (await loadChatContext(supabase, conversationId)) ?? {};
  const merged: ChatContext = { ...existing, ...patch };
  const { error } = await supabase
    .from("conversations")
    .update({ chat_context: merged })
    .eq("id", conversationId);
  if (error) console.error("persistChatContext failed", error);
}

export function formatChatContextForPrompt(ctx: ChatContext | null): string {
  if (!ctx) return "";
  const parts: string[] = [];
  if (ctx.last_direction) {
    parts.push(
      ctx.last_direction === "incoming" ? "gelen faturalar" : "giden faturalar",
    );
  }
  if (ctx.last_date_range) {
    parts.push(
      `${ctx.last_date_range.startDate} – ${ctx.last_date_range.endDate}`,
    );
  }
  if (ctx.last_counterparty) {
    parts.push(`cari: ${ctx.last_counterparty}`);
  }
  if (ctx.last_tool) {
    parts.push(`son araç: ${ctx.last_tool}`);
  }
  if (parts.length === 0) return "";
  return `\n\nSohbet bağlamı (son sorgu): ${parts.join(", ")}.`;
}
