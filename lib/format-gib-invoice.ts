export function formatGibAmount(val?: string | number): string {
  const n = typeof val === "string" ? parseFloat(val) : (val ?? 0);
  if (isNaN(n)) return "—";
  return n.toLocaleString("tr-TR", { minimumFractionDigits: 2 }) + " ₺";
}

export function gibStatusColor(status?: string): string {
  if (!status) return "#ABABAB";
  const s = status.toLowerCase();
  if (s.includes("onay") || s === "approved") return "#22C55E";
  if (s.includes("kabul") || s === "accepted") return "#22C55E";
  if (s.includes("iptal") || s.includes("red") || s === "rejected") {
    return "#EF4444";
  }
  if (
    s.includes("bekl") ||
    s.includes("yanıt") ||
    s.includes("yanit") ||
    s.includes("kuyruk") ||
    s === "pending_response"
  ) {
    return "#F59E0B";
  }
  return "#ABABAB";
}
