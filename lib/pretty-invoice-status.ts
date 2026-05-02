export function prettyInvoiceStatus(status?: string): string {
  const s = (status || "").toLowerCase();
  if (s.includes("approved") || s.includes("onay")) return "Onaylandı";
  if (s.includes("draft") || s.includes("taslak") || s.includes("onaylanmad"))
    return "Taslak";
  if (s.includes("cancel") || s.includes("sil") || s.includes("iptal"))
    return "İptal/Silinmiş";
  return status || "—";
}
