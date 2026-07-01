import type { SupabaseClient } from "npm:@supabase/supabase-js";
import { createInvoicesExcelExport } from "../../_shared/invoices-excel-export.ts";
import {
  fetchTcmbExchangeRate,
  isForeignInvoiceCurrency,
  type SupportedExchangeCurrency,
} from "../../_shared/exchange-rate.ts";
import {
  getInvoiceProvider,
  providerContextFromSession,
} from "../../_shared/invoice-provider/index.ts";
import {
  applyFactFiltersToQuery,
  parseAmount,
  syncFactsForSession,
  toIsoDate,
  type InvoiceDirection,
} from "../../_shared/invoice-facts.ts";
import {
  parseToolDirection,
  queryFinancialSummary,
  queryInvoiceTotals,
} from "../../_shared/invoice-totals-query.ts";
import {
  loadPendingInvoice,
  pendingRequestToCreateInput,
  resolvePendingDraftRef,
  savePendingInvoice,
  type PendingInvoiceState,
} from "../../_shared/invoice-workflow.ts";
import {
  normalizeCurrencyRate,
  summarizeGibInvoicePayload,
  type CreateInvoiceInput,
} from "../../_shared/invoice-mapper.ts";
import {
  getUserProfile,
  updateUserProfile,
} from "../../_shared/profile-service.ts";
import type { FinlaSession } from "../../_shared/session-auth.ts";
import { normalizeTurkish } from "../../_shared/turkish.ts";
import {
  formatTrDate,
  istanbulTodayUtc,
  resolveDateRange,
  resolveLatestInvoiceSyncRange,
} from "../date-range.ts";
import {
  classifyGibOperationError,
  logToolCallJson,
  sanitizeForToolLog,
  type ToolCallLogMeta,
} from "../gib-tool-errors.ts";
import { maskPhone, parseFiltersFromText, parseInvoiceListDirection, sanitizeInvoiceSearchFilters } from "../intents.ts";
import type { InvoiceDetailPayload, InvoiceSearchFilters } from "../types.ts";

function factRowToInvoiceDetail(
  row: Record<string, unknown>,
  direction: InvoiceDirection,
): InvoiceDetailPayload {
  return {
    invoice_uuid: String(row.invoice_uuid ?? ""),
    issue_date: typeof row.issue_date === "string" ? row.issue_date : null,
    status: typeof row.status === "string" ? row.status : "unknown",
    currency: typeof row.currency === "string" ? row.currency : "TRY",
    gross_total: typeof row.gross_total === "number" ? row.gross_total : null,
    vat_total: typeof row.vat_total === "number" ? row.vat_total : null,
    net_total: typeof row.net_total === "number" ? row.net_total : null,
    customer_tax_id:
      typeof row.customer_tax_id === "string" ? row.customer_tax_id : null,
    customer_name:
      typeof row.customer_name === "string" ? row.customer_name : null,
    direction,
  };
}

export function createInvoiceInputFromToolInput(
  input: Record<string, unknown>,
): CreateInvoiceInput | null {
  const items = input.items;
  if (!Array.isArray(items) || typeof input.buyer_name !== "string") {
    return null;
  }
  const currency =
    typeof input.currency === "string"
      ? input.currency.trim().toUpperCase()
      : "TRY";
  const resolvedRate =
    typeof input.exchange_rate === "string" ? input.exchange_rate.trim() : "";
  return {
    buyerName: input.buyer_name,
    buyerTaxId:
      typeof input.buyer_tax_id === "string" ? input.buyer_tax_id : undefined,
    buyerAddress:
      typeof input.buyer_address === "string" ? input.buyer_address : undefined,
    taxOffice:
      typeof input.tax_office === "string" ? input.tax_office : undefined,
    items: items.map((row) => {
      const i = row as Record<string, unknown>;
      return {
        name: String(i.name ?? ""),
        quantity: Number(i.quantity ?? 1),
        unit: String(i.unit ?? "adet"),
        unitPrice: Number(i.unit_price ?? 0),
        vatRate: Number(i.vat_rate ?? 20),
      };
    }),
    date: typeof input.date === "string" ? input.date : undefined,
    currency,
    currencyRate: resolvedRate || undefined,
  };
}

export async function executeToolImpl(
  supabase: SupabaseClient,
  toolName: string,
  input: Record<string, unknown>,
  session: FinlaSession,
  userMessage: string,
  conversationId: string,
): Promise<unknown> {
  const provider = getInvoiceProvider();
  const providerCtx = providerContextFromSession(session);
  const scopeKey = session.userId;
  const parsedFromText = parseFiltersFromText(userMessage);
  const amountGteFromInput =
    typeof input.amount_gte === "number"
      ? input.amount_gte
      : typeof input.amount_gte === "string"
        ? parseAmount(input.amount_gte)
        : null;
  const amountEqFromInput =
    typeof input.amount_eq === "number"
      ? input.amount_eq
      : typeof input.amount_eq === "string"
        ? parseAmount(input.amount_eq as string)
        : null;
  const filters: InvoiceSearchFilters = sanitizeInvoiceSearchFilters({
    customerName:
      typeof input.customer_name === "string"
        ? input.customer_name
        : parsedFromText.customerName,
    amountGte: amountGteFromInput ?? parsedFromText.amountGte,
    amountEq: amountEqFromInput ?? parsedFromText.amountEq,
  });

  switch (toolName) {
    case "get_user_profile":
      return getUserProfile(session);

    case "update_user_profile":
      return updateUserProfile(session, input);

    case "lookup_recipient":
      return provider.lookupRecipient(
        providerCtx,
        input.tax_id as string,
      );

    case "get_exchange_rate": {
      const currency = input.currency as string;
      if (!isForeignInvoiceCurrency(currency)) {
        throw new Error("Sadece USD veya EUR kuru sorgulanabilir.");
      }
      const quote = await fetchTcmbExchangeRate(
        currency as SupportedExchangeCurrency,
        typeof input.date === "string" ? input.date : undefined,
      );
      return {
        status: "ok",
        currency: quote.currency,
        exchange_rate: quote.rate,
        rate_date: quote.rateDate,
        source: quote.source,
        rate_type: quote.rateType,
        message:
          `TCMB ${quote.rateDate} döviz satış kuru: 1 ${quote.currency} = ${quote.rate} TL`,
      };
    }

    case "create_invoice": {
      const existingPending = await loadPendingInvoice(supabase, conversationId);
      if (
        existingPending?.status === "preview_ready" &&
        existingPending?.draft?.uuid
      ) {
        const hasHtml =
          typeof existingPending.preview_html === "string" &&
          existingPending.preview_html.length > 0;
        return {
          status: "preview_ready",
          draft_uuid: existingPending.draft.uuid,
          reused_existing: true,
          ...(hasHtml ? {} : { preview_html_pending: true }),
          message:
            "Zaten bir fatura taslağı var. Önizlemeyi açıp kontrol et; uygunsa onayla.",
        };
      }

      const items = input.items as {
        name: string;
        quantity: number;
        unit: string;
        unit_price: number;
        vat_rate: number;
      }[];
      const currency =
        typeof input.currency === "string"
          ? input.currency.trim().toUpperCase()
          : "TRY";
      const invoiceDate =
        typeof input.date === "string" ? input.date : undefined;
      const providedRate =
        typeof input.exchange_rate === "string"
          ? input.exchange_rate.trim()
          : "";

      let resolvedRate = providedRate;
      if (isForeignInvoiceCurrency(currency) && !resolvedRate) {
        const quote = await fetchTcmbExchangeRate(
          currency as SupportedExchangeCurrency,
          invoiceDate,
        );
        await savePendingInvoice(supabase, conversationId, {
          status: "exchange_rate_pending",
          exchange_rate_quote: {
            currency: quote.currency,
            rate: quote.rate,
            rate_date: quote.rateDate,
            source: quote.source,
            rate_type: quote.rateType,
          },
          request: input,
        });

        return {
          status: "exchange_rate_confirmation",
          currency: quote.currency,
          exchange_rate: quote.rate,
          rate_date: quote.rateDate,
          source: quote.source,
          rate_type: quote.rateType,
          message:
            `TCMB ${quote.rateDate} kuru: 1 ${quote.currency} = ${quote.rate} TL (döviz satış). Bu kurla fatura taslağı oluşturmamı onaylıyor musun? Farklı bir kur istersen belirt.`,
        };
      }

      if (isForeignInvoiceCurrency(currency) && resolvedRate) {
        resolvedRate = normalizeCurrencyRate(resolvedRate);
      }

      const invoiceInput: CreateInvoiceInput = {
        buyerName: input.buyer_name as string,
        buyerTaxId: input.buyer_tax_id as string | undefined,
        buyerAddress: input.buyer_address as string | undefined,
        taxOffice:
          typeof input.tax_office === "string" ? input.tax_office : undefined,
        items: items.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          unit: i.unit,
          unitPrice: i.unit_price,
          vatRate: i.vat_rate,
        })),
        date: invoiceDate,
        currency,
        currencyRate: resolvedRate || undefined,
      };

      const preview = await provider.createInvoicePreview(
        providerCtx,
        invoiceInput,
      );

      await savePendingInvoice(supabase, conversationId, {
        status: "preview_ready",
        draft: preview.draft,
        request: { ...input, exchange_rate: resolvedRate || undefined },
        ...(isForeignInvoiceCurrency(currency)
          ? {
            exchange_rate_quote: {
              currency,
              rate: resolvedRate,
              rate_date: invoiceDate ?? "",
              source: providedRate ? "user" : "TCMB",
              rate_type: "forex_selling",
            },
          }
          : {}),
        preview_html: preview.html,
        created_at: new Date().toISOString(),
      });

      return {
        status: "preview_ready",
        draft_uuid: preview.draft.uuid,
        ...(isForeignInvoiceCurrency(currency)
          ? { exchange_rate: resolvedRate, currency }
          : {}),
        ...(preview.html.length > 0 ? {} : { preview_html_pending: true }),
        message: preview.html.length > 0
          ? "Taslak oluşturuldu. Önizlemeyi kontrol et; uygunsa onayla ve GİB'e gönderelim."
          : "Taslak Mysoft'ta oluşturuldu. Önizleme açılacak; uygunsa onayla ve GİB'e gönderelim.",
      };
    }

    case "request_invoice_sign_otp":
    case "verify_invoice_sign_otp": {
      return {
        status: "deprecated",
        message:
          "Mysoft akışında SMS imza gerekmez. Kullanıcı önizlemeyi onayladıysa confirm_invoice_issue çağır.",
      };
    }

    case "confirm_invoice_issue": {
      const pending = await loadPendingInvoice(supabase, conversationId);
      const draftRef = resolvePendingDraftRef(pending);
      if (!draftRef) {
        throw new Error("Onay bekleyen bir fatura taslağı bulunamadı.");
      }

      const issued = await provider.confirmInvoiceIssue(
        providerCtx,
        {
          date: draftRef.date,
          uuid: draftRef.uuid,
        },
        { resendInput: pendingRequestToCreateInput(pending) ?? undefined },
      );
      const items = Array.isArray(pending?.request?.items)
        ? pending.request.items
        : [];
      const netTotal = items.reduce(
        (sum, item) =>
          sum +
          (Number(item.quantity ?? 0) * Number(item.unit_price ?? 0) || 0),
        0,
      );
      const vatTotal = items.reduce(
        (sum, item) =>
          sum +
          ((Number(item.quantity ?? 0) *
            Number(item.unit_price ?? 0) *
            Number(item.vat_rate ?? 0)) /
            100 || 0),
        0,
      );
      const grossTotal = netTotal + vatTotal;

      const { error: convError } = await supabase
        .from("conversations")
        .update({
          pending_invoice: null,
          last_invoice: {
            uuid: issued.uuid,
            html: issued.html,
            issue_date: draftRef.date,
            status: "approved",
            currency: pending?.request?.currency ?? "TRY",
            gross_total: grossTotal,
            vat_total: vatTotal,
            net_total: netTotal,
            customer_name: pending?.request?.buyer_name ?? null,
            customer_tax_id: pending?.request?.buyer_tax_id ?? null,
            issued_at: new Date().toISOString(),
          },
        })
        .eq("id", conversationId);
      if (convError) throw convError;

      await supabase.from("invoice_facts").upsert(
        {
          gib_username: scopeKey,
          user_id: session.userId,
          tenant_vkn: session.tenantVkn ?? null,
          invoice_uuid: issued.uuid,
          direction: "outgoing",
          issue_date: draftRef.date.split("/").reverse().join("-"),
          status: "approved",
          currency: pending?.request?.currency ?? "TRY",
          gross_total: grossTotal,
          vat_total: vatTotal,
          net_total: netTotal,
          customer_tax_id: pending?.request?.buyer_tax_id ?? null,
          customer_name: pending?.request?.buyer_name ?? null,
          raw_payload: {
            source: "confirm_invoice_issue",
            draft: draftRef,
            request: pending?.request ?? null,
          },
          synced_at: new Date().toISOString(),
        },
        { onConflict: "gib_username,invoice_uuid,direction" },
      );

      return {
        status: "issued",
        uuid: issued.uuid,
        message: "Fatura başarıyla kesildi.",
      };
    }

    case "list_invoices": {
      const range = resolveDateRange(input, userMessage, "month");
      if (!range) throw new Error("Tarih aralığı belirlenemedi.");
      const listDirection = parseInvoiceListDirection(input, userMessage);
      const hasFilters =
        !!filters.customerName ||
        typeof filters.amountGte === "number" ||
        typeof filters.amountEq === "number";

      if (listDirection === "both" && !hasFilters) {
        const [incomingInvoices, outgoingInvoices] = await Promise.all([
          provider.listIncomingInvoices(
            providerCtx,
            range.startDate,
            range.endDate,
          ),
          provider.listOutgoingInvoices(
            providerCtx,
            range.startDate,
            range.endDate,
          ),
        ]);
        return {
          direction: "both",
          count: incomingInvoices.length + outgoingInvoices.length,
          start_date: range.startDate,
          end_date: range.endDate,
          invoices: [],
          incoming: {
            count: incomingInvoices.length,
            invoices: incomingInvoices,
          },
          outgoing: {
            count: outgoingInvoices.length,
            invoices: outgoingInvoices,
          },
        };
      }

      const direction = listDirection === "both" ? "outgoing" : listDirection;
      if (!hasFilters) {
        const invoices =
          direction === "incoming"
            ? await provider.listIncomingInvoices(
              providerCtx,
              range.startDate,
              range.endDate,
            )
            : await provider.listOutgoingInvoices(
              providerCtx,
              range.startDate,
              range.endDate,
            );
        return {
          count: invoices.length,
          start_date: range.startDate,
          end_date: range.endDate,
          direction,
          invoices,
        };
      }

      await syncFactsForSession(
        supabase,
        session,
        range.startDate,
        range.endDate,
        direction,
      );
      let query = supabase
        .from("invoice_facts")
        .select("raw_payload")
        .eq("gib_username", scopeKey)
        .eq("direction", direction)
        .gte("issue_date", toIsoDate(range.startDate))
        .lte("issue_date", toIsoDate(range.endDate))
        .order("issue_date", { ascending: false })
        .limit(100);
      query = applyFactFiltersToQuery(query, filters);
      const { data, error } = await query;
      if (error) throw error;
      const invoices = (data ?? []).map(
        (row: { raw_payload: unknown }) => row.raw_payload,
      );
      return {
        count: invoices.length,
        start_date: range.startDate,
        end_date: range.endDate,
        direction,
        invoices,
      };
    }

    case "invoice_totals": {
      const range = resolveDateRange(input, userMessage, "month");
      if (!range) throw new Error("Tarih aralığı belirlenemedi.");
      const direction = parseToolDirection(input);
      const totals = await queryInvoiceTotals(
        supabase,
        session,
        scopeKey,
        range.startDate,
        range.endDate,
        direction,
        filters,
      );
      return {
        start_date: range.startDate,
        end_date: range.endDate,
        direction,
        totals,
      };
    }

    case "invoice_financial_summary": {
      const range = resolveDateRange(input, userMessage, "month");
      if (!range) throw new Error("Tarih aralığı belirlenemedi.");
      return await queryFinancialSummary(
        supabase,
        session,
        scopeKey,
        range.startDate,
        range.endDate,
        filters,
      );
    }

    case "latest_invoice": {
      const direction = parseToolDirection(input);
      const explicitRange = resolveDateRange(input, userMessage, "none");
      const syncRange = explicitRange ?? resolveLatestInvoiceSyncRange();
      await syncFactsForSession(
        supabase,
        session,
        syncRange.startDate,
        syncRange.endDate,
        direction,
      );

      const hasCustomerFilter = !!filters.customerName?.trim();
      const queryLimit = hasCustomerFilter ? 40 : 1;

      let query = supabase
        .from("invoice_facts")
        .select(
          "invoice_uuid, issue_date, status, currency, gross_total, vat_total, net_total, customer_tax_id, customer_name, direction",
        )
        .eq("gib_username", scopeKey)
        .eq("direction", direction)
        .order("issue_date", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(queryLimit);
      if (explicitRange) {
        query = query
          .gte("issue_date", toIsoDate(explicitRange.startDate))
          .lte("issue_date", toIsoDate(explicitRange.endDate));
      }
      query = applyFactFiltersToQuery(query, filters);
      const { data, error } = await query;
      if (error) throw error;
      const rows = Array.isArray(data) ? data : [];

      const reference_date = formatTrDate(istanbulTodayUtc());

      if (hasCustomerFilter && rows.length > 0) {
        const byCustomer = new Map<string, (typeof rows)[0]>();
        for (const row of rows) {
          const name = typeof row.customer_name === "string"
            ? row.customer_name.trim()
            : "";
          if (!name) continue;
          const key = normalizeTurkish(name);
          if (!byCustomer.has(key)) byCustomer.set(key, row);
        }
        const groups = [...byCustomer.values()];
        if (groups.length > 1) {
          return {
            status: "ambiguous_customer",
            customer_query: filters.customerName,
            reference_date,
            direction,
            sync_start_date: syncRange.startDate,
            sync_end_date: syncRange.endDate,
            candidates: groups.map((r) => ({
              invoice_uuid: r.invoice_uuid,
              customer_name: r.customer_name,
              issue_date: r.issue_date,
              gross_total: r.gross_total,
              currency: r.currency ?? "TRY",
              status: r.status ?? "unknown",
            })),
            invoice: null,
          };
        }
        const picked = groups[0] ?? rows[0];
        return {
          reference_date,
          sync_start_date: syncRange.startDate,
          sync_end_date: syncRange.endDate,
          direction,
          invoice: picked
            ? factRowToInvoiceDetail(picked, direction)
            : null,
        };
      }

      return {
        reference_date,
        sync_start_date: syncRange.startDate,
        sync_end_date: syncRange.endDate,
        direction,
        invoice: rows[0]
          ? factRowToInvoiceDetail(rows[0], direction)
          : null,
      };
    }

    case "export_invoices_excel": {
      const range = resolveDateRange(input, userMessage, "month");
      if (!range) throw new Error("Tarih aralığı belirlenemedi.");
      const direction = parseToolDirection(input);
      return await createInvoicesExcelExport({
        supabase,
        session,
        startDateTr: range.startDate,
        endDateTr: range.endDate,
        direction,
        filters: {
          customerName: filters.customerName,
          amountGte: filters.amountGte,
          amountEq: filters.amountEq,
        },
      });
    }

    case "cancel_invoice":
      return provider.cancelInvoice(
        providerCtx,
        input.ettn as string,
        (input.reason as string) || "İptal",
      );

    default:
      throw new Error(`Bilinmeyen araç: ${toolName}`);
  }
}

export async function executeTool(
  supabase: SupabaseClient,
  toolName: string,
  input: Record<string, unknown>,
  session: FinlaSession,
  userMessage: string,
  conversationId: string,
  logMeta?: ToolCallLogMeta,
): Promise<unknown> {
  const startedAt = Date.now();
  const { ndjsonWriter, ...metaRest } = logMeta ?? {};
  const logBase = {
    tool: toolName,
    conversation_id: conversationId,
    user_id: session.userId,
    ...metaRest,
  };
  await logToolCallJson(
    {
      ...logBase,
      phase: "start",
      input: sanitizeForToolLog(input),
      user_message_preview:
        userMessage.length > 200
          ? `${userMessage.slice(0, 200)}…`
          : userMessage,
    },
    ndjsonWriter,
  );

  try {
    const result = await executeToolImpl(
      supabase,
      toolName,
      input,
      session,
      userMessage,
      conversationId,
    );
    await logToolCallJson(
      {
        ...logBase,
        phase: "success",
        duration_ms: Date.now() - startedAt,
        output: sanitizeForToolLog(result),
      },
      ndjsonWriter,
    );
    return result;
  } catch (err) {
    const classified = classifyGibOperationError(err, toolName);
    const gibPayloadDebug =
      toolName === "create_invoice"
        ? (() => {
          const mapped = createInvoiceInputFromToolInput(input);
          return mapped ? summarizeGibInvoicePayload(mapped) : undefined;
        })()
        : undefined;
    let classifiedMessage = classified.message;
    if (
      classified.code === "INVALID_INVOICE_DATA" &&
      gibPayloadDebug !== undefined
    ) {
      classifiedMessage =
        `${classified.message} [gib_debug: ${JSON.stringify(gibPayloadDebug)}]`;
    }
    await logToolCallJson(
      {
        ...logBase,
        phase: "error",
        duration_ms: Date.now() - startedAt,
        error_message: err instanceof Error ? err.message : String(err),
        error_code: classified.code,
        error_classified_message: classifiedMessage,
        ...(gibPayloadDebug !== undefined
          ? { gib_payload_debug: gibPayloadDebug }
          : {}),
      },
      ndjsonWriter,
    );
    throw err;
  }
}
