export function formatGibAmount(val?: string | number): string {
  const n = typeof val === "string" ? parseFloat(val) : (val ?? 0);
  if (isNaN(n)) return "—";
  return n.toLocaleString("tr-TR", { minimumFractionDigits: 2 }) + " ₺";
}

export function gibStatusColor(status?: string): string {
  if (!status) return "#ABABAB";
  const s = status.toLowerCase();
  if (s.includes("onay")) return "#22C55E";
  if (s.includes("iptal") || s.includes("red")) return "#EF4444";
  return "#ABABAB";
}
