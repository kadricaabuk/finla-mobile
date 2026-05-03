import type Anthropic from "npm:@anthropic-ai/sdk";
import type { FinlaFeatures } from "./feature-config.ts";

/** Claude'a verilecek izinli araç adları (istemci manipülasyonuna karşı sunucuda tekrar doğrulanır). */
export function allowedToolNames(f: FinlaFeatures): Set<string> {
  const s = new Set<string>();
  if (f.profile) {
    s.add("get_user_profile");
    s.add("update_user_profile");
  }
  if (f.outgoingInvoices) {
    [
      "lookup_recipient",
      "create_invoice",
      "confirm_invoice_issue",
      "request_invoice_sign_otp",
      "verify_invoice_sign_otp",
      "list_invoices",
      "invoice_totals",
      "latest_invoice",
      "cancel_invoice",
    ].forEach((n) => s.add(n));
  }
  if (f.incomingInvoices) {
    s.add("list_invoices_received");
  }
  if (f.outgoingInvoices || f.incomingInvoices) {
    s.add("export_invoices_excel");
  }
  return s;
}

export function filterToolsWithEphemeralPromptCacheLast(
  allTools: Anthropic.Tool[],
  names: Set<string>,
): Anthropic.Tool[] {
  const filtered = allTools.filter((t) => names.has(t.name));
  if (filtered.length === 0) return filtered;
  return filtered.map((t, i) =>
    i === filtered.length - 1
      ? {
        ...t,
        cache_control: {
          type: "ephemeral",
        } as Anthropic.CacheControlEphemeral,
      }
      : t
  );
}
