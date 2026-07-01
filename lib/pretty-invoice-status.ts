import { prettyIncomingInvoiceStatus } from "@/lib/incoming-invoice-status";
import type { InvoiceListDirection } from "@/types/gib-invoice";

export function prettyInvoiceStatus(
  status?: string,
  options?: { direction?: InvoiceListDirection },
): string {
  if (options?.direction === "incoming") {
    return prettyIncomingInvoiceStatus(status);
  }

  const s = (status || "").toLowerCase();
  if (
    s === "pending_response" ||
    s === "accepted" ||
    s === "rejected"
  ) {
    return prettyIncomingInvoiceStatus(status);
  }

  if (s.includes("approved") || s.includes("onay")) return "Onaylandı";
  if (s.includes("draft") || s.includes("taslak") || s.includes("onaylanmad")) {
    return "Taslak";
  }
  if (s.includes("cancel") || s.includes("sil") || s.includes("iptal")) {
    return "İptal/Silinmiş";
  }
  return status || "—";
}
