import type { SupabaseClient } from "npm:@supabase/supabase-js";
import {
  getInvoiceProvider,
  providerContextFromSession,
} from "./invoice-provider/index.ts";
import {
  gibGetInvoicesIssuedToMe,
  gibListInvoices,
  mapInvoicesToFacts,
} from "./gib.ts";
import type { FinlaSession } from "./session-auth.ts";
import { isMockMode } from "./invoice-provider/mock-provider.ts";
import { normalizeTurkish } from "./turkish.ts";

export { parseAmount } from "./amount-parse.ts";

export type InvoiceDirection = "outgoing" | "incoming";

export type InvoiceSearchFilters = {
  customerName?: string;
  amountGte?: number;
  amountEq?: number;
};

export type InvoiceExportFilters = InvoiceSearchFilters;

export type InvoiceFactRow = {
  invoice_uuid: string;
  direction: string;
  issue_date: string | null;
  status: string;
  currency: string;
  gross_total: number | null;
  vat_total: number | null;
  net_total: number | null;
  customer_tax_id: string | null;
  customer_name: string | null;
};

/** GG/AA/YYYY → YYYY-MM-DD */
export function toIsoDate(trDate: string): string {
  const m = trDate.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) throw new Error("Tarih formatı GG/AA/YYYY olmalıdır.");
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export async function syncFactsForRange(
  supabase: SupabaseClient,
  username: string,
  startDate: string,
  endDate: string,
  factDirection: InvoiceDirection,
): Promise<void> {
  const invoices =
    factDirection === "outgoing"
      ? await gibListInvoices(username, startDate, endDate)
      : await gibGetInvoicesIssuedToMe(username, startDate, endDate);
  const facts = mapInvoicesToFacts(
    username,
    invoices as unknown[],
    factDirection,
  );
  if (facts.length === 0) return;
  const { error } = await supabase.from("invoice_facts").upsert(facts, {
    onConflict: "gib_username,invoice_uuid,direction",
  });
  if (error) throw error;
}

export async function syncFactsForSession(
  supabase: SupabaseClient,
  session: FinlaSession,
  startDate: string,
  endDate: string,
  factDirection: InvoiceDirection,
): Promise<void> {
  const scopeKey = session.userId;
  const provider = getInvoiceProvider();
  const ctx = providerContextFromSession(session);
  const invoices =
    factDirection === "outgoing"
      ? await provider.listOutgoingInvoices(ctx, startDate, endDate)
      : await provider.listIncomingInvoices(ctx, startDate, endDate);
  const facts = mapInvoicesToFacts(
    scopeKey,
    invoices as unknown[],
    factDirection,
  ).map((row) => ({
    ...row,
    user_id: session.userId,
    tenant_vkn: session.tenantVkn ?? null,
  }));
  if (facts.length === 0) return;
  const { error } = await supabase.from("invoice_facts").upsert(facts, {
    onConflict: "gib_username,invoice_uuid,direction",
  });
  if (error) throw error;
}

export function shouldUseSessionFactsSync(): boolean {
  return isMockMode();
}

/** Supabase query builder üzerinde ortak filtreler. */
export function applyFactFiltersToQuery<
  T extends {
    ilike: (col: string, pattern: string) => T;
    gte: (col: string, val: number) => T;
    lte: (col: string, val: number) => T;
  },
>(query: T, filters: InvoiceSearchFilters): T {
  let next = query;
  if (filters.customerName) {
    next = next.ilike("customer_name", `%${filters.customerName}%`);
  }
  if (typeof filters.amountGte === "number") {
    next = next.gte("gross_total", filters.amountGte);
  }
  if (typeof filters.amountEq === "number") {
    const min = Math.max(0, filters.amountEq - 0.5);
    const max = filters.amountEq + 0.5;
    next = next.gte("gross_total", min).lte("gross_total", max);
  }
  return next;
}

const EQ_TOLERANCE = 0.5;

/** invoice_facts satırlarında normalize müşteri/tutar filtresi. */
export function filterInvoiceFacts(
  facts: InvoiceFactRow[],
  filters: InvoiceSearchFilters,
): InvoiceFactRow[] {
  const hasCustomer =
    typeof filters.customerName === "string" &&
    filters.customerName.trim().length > 0;
  const hasAmountGte = typeof filters.amountGte === "number";
  const hasAmountEq = typeof filters.amountEq === "number";
  if (!hasCustomer && !hasAmountGte && !hasAmountEq) return facts;

  const normalizedCustomer = hasCustomer
    ? normalizeTurkish(filters.customerName!)
    : "";

  return facts.filter((f) => {
    if (hasCustomer) {
      const candidate = normalizeTurkish(f.customer_name ?? "");
      if (!candidate.includes(normalizedCustomer)) return false;
    }
    const amount = f.gross_total ?? f.net_total ?? 0;
    if (hasAmountGte && amount < filters.amountGte!) return false;
    if (
      hasAmountEq &&
      Math.abs(amount - filters.amountEq!) > EQ_TOLERANCE
    ) {
      return false;
    }
    return true;
  });
}

/** Ham GİB listesini fact UUID eşleşmesiyle filtreler. */
export function filterGibInvoicesByFacts(
  invoices: unknown[],
  matchedFacts: InvoiceFactRow[],
): unknown[] {
  const matchedSet = new Set(matchedFacts.map((f) => f.invoice_uuid));
  return (invoices as Array<Record<string, unknown>>).filter((i) => {
    const ettn = typeof i.ettn === "string" ? i.ettn : "";
    const docNo = typeof i.belgeNumarasi === "string" ? i.belgeNumarasi : "";
    return matchedSet.has(ettn) || matchedSet.has(docNo);
  });
}
