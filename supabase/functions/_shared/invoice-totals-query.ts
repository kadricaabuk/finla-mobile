import type { SupabaseClient } from "npm:@supabase/supabase-js";
import type { FinlaSession } from "./session-auth.ts";
import {
  applyFactFiltersToQuery,
  syncFactsForSession,
  toIsoDate,
  type InvoiceDirection,
  type InvoiceSearchFilters,
} from "./invoice-facts.ts";
import { isIncomingExpenseFactStatus } from "./incoming-invoice-status.ts";

export type InvoiceTotalsBucket = {
  count_total: number;
  sum_gross_total: number;
  sum_vat_total: number;
  sum_net_total: number;
};

export type InvoiceFinancialSummary = {
  start_date: string;
  end_date: string;
  incoming: InvoiceTotalsBucket;
  outgoing: InvoiceTotalsBucket;
  net_gross: number;
  net_vat: number;
  net_net: number;
};

const EMPTY_TOTALS: InvoiceTotalsBucket = {
  count_total: 0,
  sum_gross_total: 0,
  sum_vat_total: 0,
  sum_net_total: 0,
};

function reduceTotals(
  rows: Array<{
    gross_total: number | null;
    vat_total: number | null;
    net_total: number | null;
    status?: string | null;
  }>,
  direction: InvoiceDirection,
): InvoiceTotalsBucket {
  const countable = direction === "incoming"
    ? rows.filter((row) => isIncomingExpenseFactStatus(row.status))
    : rows.filter((row) => row.status === "approved");
  return countable.reduce(
    (acc, row) => {
      acc.count_total += 1;
      acc.sum_gross_total += row.gross_total ?? 0;
      acc.sum_vat_total += row.vat_total ?? 0;
      acc.sum_net_total += row.net_total ?? 0;
      return acc;
    },
    { ...EMPTY_TOTALS },
  );
}

export async function queryInvoiceTotals(
  supabase: SupabaseClient,
  session: FinlaSession,
  scopeKey: string,
  startDate: string,
  endDate: string,
  direction: InvoiceDirection,
  filters: InvoiceSearchFilters = {},
): Promise<InvoiceTotalsBucket> {
  await syncFactsForSession(
    supabase,
    session,
    startDate,
    endDate,
    direction,
  );

  let query = supabase
    .from("invoice_facts")
    .select("gross_total, vat_total, net_total, status")
    .eq("gib_username", scopeKey)
    .eq("direction", direction)
    .gte("issue_date", toIsoDate(startDate))
    .lte("issue_date", toIsoDate(endDate));

  if (direction === "outgoing") {
    query = query.eq("status", "approved");
  }
  query = applyFactFiltersToQuery(query, filters);

  const { data, error } = await query;
  if (error) throw error;
  return reduceTotals(data ?? [], direction);
}

export async function queryFinancialSummary(
  supabase: SupabaseClient,
  session: FinlaSession,
  scopeKey: string,
  startDate: string,
  endDate: string,
  filters: InvoiceSearchFilters = {},
): Promise<InvoiceFinancialSummary> {
  const [incoming, outgoing] = await Promise.all([
    queryInvoiceTotals(
      supabase,
      session,
      scopeKey,
      startDate,
      endDate,
      "incoming",
      filters,
    ),
    queryInvoiceTotals(
      supabase,
      session,
      scopeKey,
      startDate,
      endDate,
      "outgoing",
      filters,
    ),
  ]);

  return {
    start_date: startDate,
    end_date: endDate,
    incoming,
    outgoing,
    net_gross: outgoing.sum_gross_total - incoming.sum_gross_total,
    net_vat: outgoing.sum_vat_total - incoming.sum_vat_total,
    net_net: outgoing.sum_net_total - incoming.sum_net_total,
  };
}

export function parseToolDirection(
  input: Record<string, unknown>,
): InvoiceDirection {
  return input.direction === "incoming" ? "incoming" : "outgoing";
}
