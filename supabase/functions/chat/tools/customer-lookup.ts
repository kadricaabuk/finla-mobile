import type { SupabaseClient } from "npm:@supabase/supabase-js";
import { normalizeTurkish } from "../../_shared/turkish.ts";

/**
 * invoice_facts'ten türetilen kayıtlı müşteri/tedarikçi kaydı.
 * VKN/TCKN başına tek satır; last_invoice_* alanları en güncel faturadan gelir.
 * Not: invoice_facts satır (kalem) detayı tutmaz; yalnızca belge toplamları var.
 */
export interface KnownCustomer {
  customer_name: string;
  customer_tax_id: string;
  last_invoice_date: string | null;
  last_invoice_gross_total: number | null;
  last_invoice_net_total: number | null;
  last_invoice_vat_total: number | null;
  last_invoice_currency: string;
  last_invoice_direction: "outgoing" | "incoming";
  invoice_count: number;
}

export interface CustomerFactRow {
  customer_name?: unknown;
  customer_tax_id?: unknown;
  issue_date?: unknown;
  gross_total?: unknown;
  vat_total?: unknown;
  net_total?: unknown;
  currency?: unknown;
  direction?: unknown;
}

/**
 * issue_date'e göre azalan sıralı fact satırlarını VKN/TCKN başına tek kayda
 * indirger (en güncel fatura + toplam fatura sayısı). nameQuery Türkçe
 * karakter duyarsız kısmi eşleşme yapar; boşsa tüm taraflar dahil edilir.
 */
export function dedupeKnownCustomers(
  rows: CustomerFactRow[],
  nameQuery: string,
  limit: number,
): KnownCustomer[] {
  const normalizedQuery = normalizeTurkish(nameQuery.trim());
  const byTaxId = new Map<string, KnownCustomer>();
  for (const row of rows) {
    const name = typeof row.customer_name === "string"
      ? row.customer_name.trim()
      : "";
    const taxId = typeof row.customer_tax_id === "string"
      ? row.customer_tax_id.trim()
      : "";
    if (!name || !taxId) continue;
    if (normalizedQuery && !normalizeTurkish(name).includes(normalizedQuery)) {
      continue;
    }
    const existing = byTaxId.get(taxId);
    if (existing) {
      existing.invoice_count += 1;
      continue;
    }
    byTaxId.set(taxId, {
      customer_name: name,
      customer_tax_id: taxId,
      last_invoice_date: typeof row.issue_date === "string"
        ? row.issue_date
        : null,
      last_invoice_gross_total: typeof row.gross_total === "number"
        ? row.gross_total
        : null,
      last_invoice_net_total: typeof row.net_total === "number"
        ? row.net_total
        : null,
      last_invoice_vat_total: typeof row.vat_total === "number"
        ? row.vat_total
        : null,
      last_invoice_currency: typeof row.currency === "string"
        ? row.currency
        : "TRY",
      last_invoice_direction: row.direction === "incoming"
        ? "incoming"
        : "outgoing",
      invoice_count: 1,
    });
  }
  return [...byTaxId.values()].slice(0, limit);
}

/**
 * Geçmiş faturalardan (giden + gelen) isimle kayıtlı müşteri arar.
 * find_customer aracı ve create_invoice'taki sunucu tarafı alıcı çözümü
 * (buyer_tax_id verilmeyen yurt içi fatura) bu tek noktayı kullanır.
 */
export async function findKnownCustomers(
  supabase: SupabaseClient,
  scopeKey: string,
  nameQuery: string,
  limit: number,
): Promise<KnownCustomer[]> {
  const { data, error } = await supabase
    .from("invoice_facts")
    .select(
      "customer_name, customer_tax_id, issue_date, gross_total, vat_total, net_total, currency, direction",
    )
    .eq("gib_username", scopeKey)
    .not("customer_tax_id", "is", null)
    .not("customer_name", "is", null)
    .order("issue_date", { ascending: false })
    .limit(400);
  if (error) throw error;
  const rows = Array.isArray(data) ? (data as CustomerFactRow[]) : [];
  return dedupeKnownCustomers(rows, nameQuery, limit);
}
