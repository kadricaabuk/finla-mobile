import type { ChatAction, InvoiceDetailPayload } from "./types.ts";
import type { InvoiceDirection, InvoiceSearchFilters } from "../_shared/invoice-facts.ts";
import type { InvoiceFinancialSummary, InvoiceTotalsBucket } from "../_shared/invoice-totals-query.ts";
import { resolveDateRange } from "./date-range.ts";

export type LatestInvoiceCandidate = {
  invoice_uuid: string;
  customer_name: string | null;
  issue_date: string | null;
  gross_total: number | null;
  currency: string;
  status: string;
};

export type LatestInvoiceToolResult = {
  invoice: InvoiceDetailPayload | null;
  ambiguous?: boolean;
  customer_query?: string;
  candidates?: LatestInvoiceCandidate[];
  reference_date?: string;
};

export type InvoiceListSlice = {
  count: number;
  invoices: unknown[];
};

export type InvoiceListToolResult = {
  count: number;
  start_date: string;
  end_date: string;
  direction?: InvoiceDirection | "both";
  invoices: unknown[];
  incoming?: InvoiceListSlice;
  outgoing?: InvoiceListSlice;
};

function formatInvoiceLines(
  invoices: unknown[],
  direction: InvoiceDirection,
): string[] {
  return invoices.slice(0, 12).map((raw) => {
    const r = raw as Record<string, unknown>;
    const name = String(
      direction === "incoming"
        ? (r.gondericiUnvan ?? r.gondericiUnvanAdSoyad ?? r.accountName ?? "—")
        : (r.aliciUnvanAdSoyad ?? r.aliciUnvan ?? r.accountName ?? "—"),
    );
    const no = String(r.belgeNumarasi ?? r.docNo ?? "—");
    const date = String(r.belgeTarihi ?? r.faturaTarihi ?? "").slice(0, 10);
    const amt = r.vergilerDahilToplamTutar ?? r.payableAmount;
    const amtStr =
      typeof amt === "number"
        ? `${amt.toLocaleString("tr-TR")} ₺`
        : typeof amt === "string"
          ? `${amt} ₺`
          : "—";
    return `• ${name} — ${no} · ${date || "—"} · ${amtStr}`;
  });
}

export function normalizeInvoiceListToolResult(
  result: unknown,
): InvoiceListToolResult {
  if (Array.isArray(result)) {
    return {
      count: result.length,
      start_date: "",
      end_date: "",
      invoices: result,
    };
  }
  if (result && typeof result === "object") {
    const row = result as Record<string, unknown>;
    const invoices = Array.isArray(row.invoices) ? row.invoices : [];
    const normalizeSlice = (key: "incoming" | "outgoing"): InvoiceListSlice | undefined => {
      const slice = row[key];
      if (!slice || typeof slice !== "object") return undefined;
      const s = slice as Record<string, unknown>;
      const sliceInvoices = Array.isArray(s.invoices) ? s.invoices : [];
      return {
        count: typeof s.count === "number" ? s.count : sliceInvoices.length,
        invoices: sliceInvoices,
      };
    };
    return {
      count: typeof row.count === "number" ? row.count : invoices.length,
      start_date: typeof row.start_date === "string" ? row.start_date : "",
      end_date: typeof row.end_date === "string" ? row.end_date : "",
      direction:
        row.direction === "incoming" || row.direction === "outgoing" ||
          row.direction === "both"
          ? row.direction
          : undefined,
      invoices,
      incoming: normalizeSlice("incoming"),
      outgoing: normalizeSlice("outgoing"),
    };
  }
  return { count: 0, start_date: "", end_date: "", invoices: [] };
}

export function formatInvoiceListChatSummary(
  list: InvoiceListToolResult,
  direction: InvoiceDirection = list.direction === "incoming" ||
      list.direction === "outgoing"
    ? list.direction
    : "outgoing",
): string {
  const { start_date, end_date } = list;
  const rangeLabel = formatRangeLabel(start_date, end_date);

  if (
    list.direction === "both"
  ) {
    const incoming = list.incoming ?? { count: 0, invoices: [] };
    const outgoing = list.outgoing ?? { count: 0, invoices: [] };
    const incomingCount = incoming.count;
    const outgoingCount = outgoing.count;
    const total = incomingCount + outgoingCount;
    if (total === 0) {
      return `${rangeLabel} için fatura bulunamadı.`;
    }

    const parts: string[] = [
      `${rangeLabel} için ${total} fatura (${outgoingCount} giden, ${incomingCount} gelen):`,
    ];

    if (outgoingCount > 0) {
      const lines = formatInvoiceLines(outgoing.invoices, "outgoing");
      const tail = outgoing.invoices.length > 12
        ? `\n…ve ${outgoing.invoices.length - 12} giden fatura daha.`
        : "";
      parts.push(`\n**Giden (${outgoingCount})**\n${lines.join("\n")}${tail}`);
    }
    if (incomingCount > 0) {
      const lines = formatInvoiceLines(incoming.invoices, "incoming");
      const tail = incoming.invoices.length > 12
        ? `\n…ve ${incoming.invoices.length - 12} gelen fatura daha.`
        : "";
      parts.push(`\n**Gelen (${incomingCount})**\n${lines.join("\n")}${tail}`);
    }
    return parts.join("\n");
  }

  const { invoices, count } = list;
  const dirLabel = direction === "incoming" ? "gelen" : "giden";

  if (count === 0 || invoices.length === 0) {
    return `${rangeLabel} için ${dirLabel} fatura bulunamadı.`;
  }

  const lines = formatInvoiceLines(invoices, direction);
  const tail =
    invoices.length > 12
      ? `\n…ve ${invoices.length - 12} fatura daha.`
      : "";

  return `${rangeLabel} için ${count} ${dirLabel} fatura:\n\n${lines.join("\n")}${tail}`;
}

function formatMoney(amount: number): string {
  return `${amount.toLocaleString("tr-TR")} ₺`;
}

function formatRangeLabel(start: string, end: string): string {
  if (!start || !end) return "Seçilen dönem";
  return start === end ? start : `${start} – ${end}`;
}

export function formatInvoiceTotalsChatSummary(
  result: unknown,
  direction: InvoiceDirection,
): string {
  const row = result && typeof result === "object"
    ? result as Record<string, unknown>
    : {};
  const totals = row.totals as InvoiceTotalsBucket | undefined;
  const start = typeof row.start_date === "string" ? row.start_date : "";
  const end = typeof row.end_date === "string" ? row.end_date : "";
  const range = formatRangeLabel(start, end);
  const bucket = totals ?? {
    count_total: 0,
    sum_gross_total: 0,
    sum_vat_total: 0,
    sum_net_total: 0,
  };

  if (direction === "incoming") {
    return `${range} giderin (kabul edilmiş gelen faturalar): ${formatMoney(bucket.sum_gross_total)} (${bucket.count_total} fatura, KDV ${formatMoney(bucket.sum_vat_total)}).`;
  }
  return `${range} kazancın (onaylı giden faturalar): ${formatMoney(bucket.sum_gross_total)} (${bucket.count_total} fatura, KDV ${formatMoney(bucket.sum_vat_total)}).`;
}

export function formatFinancialSummaryChatSummary(result: unknown): string {
  const row = result && typeof result === "object"
    ? result as InvoiceFinancialSummary
    : null;
  if (!row) return "Finansal özet alınamadı.";

  const range = formatRangeLabel(row.start_date, row.end_date);
  const gider = formatMoney(row.incoming.sum_gross_total);
  const gelir = formatMoney(row.outgoing.sum_gross_total);
  const net = row.net_gross;
  const netLabel = net >= 0
    ? `net +${formatMoney(net)}`
    : `net −${formatMoney(Math.abs(net))}`;

  return `${range}: giderin ${gider}, kazancın ${gelir} (${netLabel}).`;
}

export function normalizeLatestInvoiceToolResult(
  result: unknown,
): LatestInvoiceToolResult {
  if (result && typeof result === "object") {
    const row = result as Record<string, unknown>;
    if (row.status === "ambiguous_customer") {
      const candidates = Array.isArray(row.candidates)
        ? row.candidates
            .filter((c): c is Record<string, unknown> =>
              !!c && typeof c === "object"
            )
            .map((c) => ({
              invoice_uuid: String(c.invoice_uuid ?? ""),
              customer_name:
                typeof c.customer_name === "string" ? c.customer_name : null,
              issue_date:
                typeof c.issue_date === "string" ? c.issue_date : null,
              gross_total:
                typeof c.gross_total === "number" ? c.gross_total : null,
              currency: typeof c.currency === "string" ? c.currency : "TRY",
              status: typeof c.status === "string" ? c.status : "—",
            }))
        : [];
      return {
        invoice: null,
        ambiguous: true,
        customer_query:
          typeof row.customer_query === "string" ? row.customer_query : undefined,
        candidates,
        reference_date:
          typeof row.reference_date === "string" ? row.reference_date : undefined,
      };
    }
    const invoice = row.invoice;
    const direction =
      row.direction === "incoming" || row.direction === "outgoing"
        ? row.direction
        : undefined;
    if (invoice && typeof invoice === "object") {
      const inv = invoice as InvoiceDetailPayload;
      return {
        invoice: direction ? { ...inv, direction } : inv,
        reference_date:
          typeof row.reference_date === "string" ? row.reference_date : undefined,
      };
    }
    return {
      invoice: null,
      reference_date:
        typeof row.reference_date === "string" ? row.reference_date : undefined,
    };
  }
  return { invoice: null };
}

function formatIsoDateTr(iso: string | null): string {
  if (!iso?.trim()) return "—";
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return iso.slice(0, 10);
}

export function formatLatestInvoiceChatSummary(
  latest: LatestInvoiceToolResult,
  filters: InvoiceSearchFilters = {},
  direction: InvoiceDirection = latest.invoice?.direction ?? "outgoing",
): string {
  const who = filters.customerName?.trim()
    ? `${filters.customerName.trim()}`
    : "";
  const dirLabel = direction === "incoming" ? "gelen" : "giden";

  if (latest.ambiguous && latest.candidates && latest.candidates.length > 1) {
    const lines = latest.candidates.map((c) => {
      const name = c.customer_name?.trim() || "—";
      const date = formatIsoDateTr(c.issue_date);
      const gross =
        typeof c.gross_total === "number"
          ? `${c.gross_total.toLocaleString("tr-TR")} ${c.currency || "TRY"}`
          : "—";
      return `• ${name} — ${date} · ${gross}`;
    });
    const query = latest.customer_query || who || "Bu isim";
    return `${query} ile eşleşen birden fazla müşteri var:\n\n${lines.join("\n")}\n\nHangisinin faturasını istiyorsun? Tam adını yazabilirsin.`;
  }

  const inv = latest.invoice;
  if (!inv?.invoice_uuid) {
    return who
      ? `${who} için ${dirLabel} fatura bulunamadı.`
      : `${dirLabel.charAt(0).toUpperCase()}${dirLabel.slice(1)} fatura bulunamadı.`;
  }
  const name = inv.customer_name?.trim() || "—";
  const date = formatIsoDateTr(inv.issue_date);
  const gross =
    typeof inv.gross_total === "number"
      ? `${inv.gross_total.toLocaleString("tr-TR")} ${inv.currency || "TRY"}`
      : "—";
  const status = inv.status?.trim() || "—";
  const prefix = who ? `${who} için ` : "";
  return `${prefix}en son ${dirLabel} fatura:\n\n${name} · ${date} · ${gross} (${status})`;
}

export function buildLatestInvoiceDetailAction(
  invoice: InvoiceDetailPayload,
): ChatAction {
  return {
    type: "open_invoice_detail",
    label: "Detayı Gör",
    invoice,
  };
}

export function buildOpenInvoicesAction(
  userMessage: string,
  listInput: Record<string, unknown> | null,
  list: InvoiceListToolResult,
  direction: InvoiceDirection,
): ChatAction | null {
  const parsedRange = resolveDateRange(
    listInput ?? {},
    userMessage,
    "month",
  );
  const range =
    parsedRange ??
    (list.start_date && list.end_date
      ? { startDate: list.start_date, endDate: list.end_date }
      : null);
  if (!range) return null;
  if (list.count === 0) return null;

  return {
    type: "open_invoices",
    label: direction === "incoming"
      ? "Gelen Faturaları Gör"
      : "Giden Faturaları Gör",
    filter: {
      startDate: range.startDate,
      endDate: range.endDate,
      direction,
    },
  };
}

export function buildOpenOutgoingInvoicesAction(
  userMessage: string,
  listInput: Record<string, unknown> | null,
  list: InvoiceListToolResult,
): ChatAction | null {
  return buildOpenInvoicesAction(userMessage, listInput, list, "outgoing");
}

export function buildOpenIncomingInvoicesAction(
  userMessage: string,
  listInput: Record<string, unknown> | null,
  list: InvoiceListToolResult,
): ChatAction | null {
  return buildOpenInvoicesAction(userMessage, listInput, list, "incoming");
}

/** Liste sonucundan tek düğme — yalnızca dolu yönü açar. */
export function buildPrimaryInvoicesAction(
  userMessage: string,
  listInput: Record<string, unknown> | null,
  list: InvoiceListToolResult,
): ChatAction | null {
  const inputWithDates = {
    ...(listInput ?? {}),
    start_date: list.start_date,
    end_date: list.end_date,
  };

  if (list.direction === "both" && list.incoming && list.outgoing) {
    const { incoming, outgoing } = list;
    if (incoming.count === 0 && outgoing.count === 0) return null;
    if (incoming.count > 0 && outgoing.count === 0) {
      return buildOpenInvoicesAction(
        userMessage,
        inputWithDates,
        { ...list, count: incoming.count, invoices: incoming.invoices },
        "incoming",
      );
    }
    if (outgoing.count > 0 && incoming.count === 0) {
      return buildOpenInvoicesAction(
        userMessage,
        inputWithDates,
        { ...list, count: outgoing.count, invoices: outgoing.invoices },
        "outgoing",
      );
    }
    const direction = outgoing.count >= incoming.count ? "outgoing" : "incoming";
    const slice = direction === "outgoing" ? outgoing : incoming;
    return buildOpenInvoicesAction(
      userMessage,
      inputWithDates,
      { ...list, count: slice.count, invoices: slice.invoices },
      direction,
    );
  }

  const direction = list.direction === "incoming" ? "incoming" : "outgoing";
  if (list.count === 0) return null;
  return buildOpenInvoicesAction(
    userMessage,
    inputWithDates,
    list,
    direction,
  );
}
