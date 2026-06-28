import type { SupabaseClient } from "npm:@supabase/supabase-js";
import * as XLSX from "npm:xlsx@0.18.5";
import { sha256Hex } from "./crypto.ts";
import {
  applyFactFiltersToQuery,
  syncFactsForRange,
  toIsoDate,
  type InvoiceExportFilters,
  type InvoiceFactRow,
} from "./invoice-facts.ts";

/**
 * Yerelde `kong:8000` gibi dahili adresler dönebilir. İstemciler için dış adres (ör.
 * http://MAKINE_IP:54321) gerekiyorsa `FINLA_PUBLIC_SUPABASE_URL` ayarlanır.
 */
function rewriteStorageSignedUrlForEdge(signedUrl: string): string | undefined {
  const target = Deno.env.get("FINLA_PUBLIC_SUPABASE_URL")?.trim();
  if (!target) return undefined;
  try {
    const u = new URL(signedUrl);
    const internal =
      u.hostname.toLowerCase() === "kong" || /^kong\./i.test(u.hostname);
    if (!internal) return undefined;
    const origin = new URL(target.endsWith("/") ? target.slice(0, -1) : target);
    u.protocol = origin.protocol;
    u.host = origin.host;
    return u.toString();
  } catch {
    return undefined;
  }
}

export const INVOICE_EXPORT_MAX_ROWS = 5000;
export const INVOICE_EXPORT_SIGNED_URL_SECONDS = 300;
const EXPORT_BUCKET = "exports";

export type { InvoiceExportFilters } from "./invoice-facts.ts";

function formatTrIssueDate(isoDate: string | null): string {
  if (!isoDate) return "";
  const m = isoDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return isoDate;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

function directionLabel(direction: string): string {
  return direction === "incoming" ? "Gelen" : "Giden";
}

function statusLabel(status: string): string {
  if (status === "approved") return "Onaylı";
  if (status === "draft") return "Taslak";
  if (status === "cancelled") return "İptal";
  return status;
}

function rowsToSheetData(
  rows: InvoiceFactRow[],
): Record<string, string | number | null>[] {
  return rows.map((r) => ({
    Yön: directionLabel(r.direction ?? ""),
    "ETTN / Belge No": r.invoice_uuid,
    "Fatura tarihi": formatTrIssueDate(r.issue_date),
    Durum: statusLabel(r.status),
    Para: r.currency ?? "TRY",
    Matrah: r.net_total,
    KDV: r.vat_total,
    Toplam: r.gross_total,
    "Cari adı / ünvan": r.customer_name,
    "Cari VKN/TCKN": r.customer_tax_id,
  }));
}

function buildXlsxBuffer(rows: InvoiceFactRow[]): Uint8Array {
  const sheetData = rowsToSheetData(rows);
  const ws = XLSX.utils.json_to_sheet(sheetData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Faturalar");
  const out = XLSX.write(wb, {
    bookType: "xlsx",
    type: "array",
  }) as ArrayBuffer | Uint8Array;
  return out instanceof Uint8Array ? out : new Uint8Array(out);
}

async function stableUserFolder(username: string): Promise<string> {
  const hex = await sha256Hex(username);
  return hex.slice(0, 16);
}

function exportFileBasename(direction: "outgoing" | "incoming"): string {
  const iso = new Date()
    .toISOString()
    .replace(/[:-]/g, "")
    .replace(/\.\d{3}Z/, "Z");
  const tag = direction === "incoming" ? "gelen" : "kesilen";
  return `finla-faturalar-${tag}-${iso.slice(0, 15)}.xlsx`;
}

export async function createInvoicesExcelExport(opts: {
  supabase: SupabaseClient;
  username: string;
  startDateTr: string;
  endDateTr: string;
  direction: "outgoing" | "incoming";
  filters: InvoiceExportFilters;
}): Promise<{
  download_url: string;
  file_name: string;
  row_count: number;
  expires_in_seconds: number;
}> {
  const { supabase, username, startDateTr, endDateTr, direction, filters } =
    opts;

  await syncFactsForRange(
    supabase,
    username,
    startDateTr,
    endDateTr,
    direction,
  );

  let query = supabase
    .from("invoice_facts")
    .select(
      "invoice_uuid, direction, issue_date, status, currency, gross_total, vat_total, net_total, customer_tax_id, customer_name",
    )
    .eq("gib_username", username)
    .eq("direction", direction)
    .gte("issue_date", toIsoDate(startDateTr))
    .lte("issue_date", toIsoDate(endDateTr))
    .order("issue_date", { ascending: false })
    .limit(INVOICE_EXPORT_MAX_ROWS + 1);

  query = applyFactFiltersToQuery(query, filters);

  const { data, error } = await query;
  if (error) throw error;

  const list = (data ?? []) as InvoiceFactRow[];
  if (list.length === 0) {
    throw new Error(
      "Bu tarih aralığında ve filtrelere uyan fatura bulunamadı; Excel oluşturulamadı.",
    );
  }
  if (list.length > INVOICE_EXPORT_MAX_ROWS) {
    throw new Error(
      `Çok fazla fatura var (>${INVOICE_EXPORT_MAX_ROWS}). Tarih aralığını daralt veya filtre eklemeyi dene.`,
    );
  }

  const buffer = buildXlsxBuffer(list);
  const folder = await stableUserFolder(username);
  const objectPath = `${folder}/${crypto.randomUUID()}.xlsx`;
  const file_name = exportFileBasename(direction);

  const uploadRes = await supabase.storage
    .from(EXPORT_BUCKET)
    .upload(objectPath, buffer, {
      contentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      upsert: false,
    });
  if (uploadRes.error) {
    console.error("exports upload failed", uploadRes.error);
    throw new Error(
      "Dosya oluşturuldu ancak depoya yazılamadı. Bir süre sonra tekrar dene.",
    );
  }

  const signed = await supabase.storage
    .from(EXPORT_BUCKET)
    .createSignedUrl(objectPath, INVOICE_EXPORT_SIGNED_URL_SECONDS);
  if (signed.error || !signed.data?.signedUrl) {
    console.error("exports signed url failed", signed.error);
    throw new Error(
      "İndirme bağlantısı oluşturulamadı. Bir süre sonra tekrar dene.",
    );
  }

  const clientVisibleUrl =
    rewriteStorageSignedUrlForEdge(signed.data.signedUrl) ??
    signed.data.signedUrl;

  return {
    download_url: clientVisibleUrl,
    file_name,
    row_count: list.length,
    expires_in_seconds: INVOICE_EXPORT_SIGNED_URL_SECONDS,
  };
}
