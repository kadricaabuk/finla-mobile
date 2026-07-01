import type { GIBInvoice } from "@/types/gib-invoice";

function parseInvoiceDateMs(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;

  const tr = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (tr) {
    return Date.UTC(Number(tr[3]), Number(tr[1]) - 1, Number(tr[2]));
  }

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  }

  const parsed = Date.parse(s);
  return Number.isFinite(parsed) ? parsed : null;
}

function invoiceDateMs(item: GIBInvoice): number {
  const fields = [
    item.belgeTarihi,
    item.faturaTarihi,
    typeof item.docDate === "string" ? item.docDate : undefined,
    typeof item.invoiceDate === "string" ? item.invoiceDate : undefined,
  ];
  for (const raw of fields) {
    if (typeof raw !== "string") continue;
    const ms = parseInvoiceDateMs(raw);
    if (ms !== null) return ms;
  }
  return 0;
}

/** Yeniden eskiye (en yeni fatura üstte). */
export function sortGibInvoicesByDate(invoices: GIBInvoice[]): GIBInvoice[] {
  return [...invoices].sort((a, b) => invoiceDateMs(b) - invoiceDateMs(a));
}
