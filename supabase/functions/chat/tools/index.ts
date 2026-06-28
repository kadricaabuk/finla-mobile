import type { SupabaseClient } from "npm:@supabase/supabase-js";
import { createInvoicesExcelExport } from "../../_shared/invoices-excel-export.ts";
import {
  fetchTcmbExchangeRate,
  isForeignInvoiceCurrency,
  type SupportedExchangeCurrency,
} from "../../_shared/exchange-rate.ts";
import {
  faturaCancelInvoice,
  faturaConfirmInvoiceIssue,
  faturaCreateInvoicePreview,
  faturaListInvoices,
  faturaLookupRecipient,
  faturaSendSignSMSCode,
  faturaVerifySignSMSCode,
} from "../../_shared/gib.ts";
import {
  applyFactFiltersToQuery,
  parseAmount,
  syncFactsForRange,
  toIsoDate,
} from "../../_shared/invoice-facts.ts";
import {
  loadPendingInvoice,
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
import { normalizeTurkish } from "../../_shared/turkish.ts";
import {
  formatTrDate,
  istanbulTodayUtc,
  resolveDateRange,
} from "../date-range.ts";
import {
  classifyGibOperationError,
  logToolCallJson,
  sanitizeForToolLog,
  type ToolCallLogMeta,
} from "../gib-tool-errors.ts";
import { maskPhone, parseFiltersFromText } from "../intents.ts";
import type { InvoiceSearchFilters } from "../types.ts";

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
  username: string,
  userMessage: string,
  conversationId: string,
): Promise<unknown> {
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
  const filters: InvoiceSearchFilters = {
    customerName:
      typeof input.customer_name === "string"
        ? input.customer_name
        : parsedFromText.customerName,
    amountGte: amountGteFromInput ?? parsedFromText.amountGte,
    amountEq: amountEqFromInput ?? parsedFromText.amountEq,
  };

  switch (toolName) {
    case "get_user_profile":
      return getUserProfile(username);

    case "update_user_profile":
      return updateUserProfile(username, input);

    case "lookup_recipient":
      return faturaLookupRecipient(username, input.tax_id as string);

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

      const preview = await faturaCreateInvoicePreview(username, invoiceInput);

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
          ? "Taslak oluşturuldu. Önizlemeyi kontrol et; uygunsa onayla ve imzalamaya geç."
          : "Taslak GİB'de oluşturuldu. Önizleme açılacak; uygunsa onayla ve imzalamaya geç.",
      };
    }

    case "request_invoice_sign_otp": {
      const pending = await loadPendingInvoice(supabase, conversationId) ?? {};
      const draft = pending?.draft;
      if (!draft?.uuid) {
        throw new Error("İmzalanacak taslak fatura bulunamadı.");
      }

      const phoneCandidate =
        (typeof input.phone === "string" && input.phone.trim()) ||
        pending.signing?.phone ||
        (await getUserProfile(username))?.phoneNumber;
      const phone =
        typeof phoneCandidate === "string" ? phoneCandidate.trim() : "";
      if (!phone) {
        return {
          status: "phone_required",
          draft_uuid: draft.uuid,
          phone_masked: "Numara gerekli",
        };
      }

      const operationId = await faturaSendSignSMSCode(username, phone);
      if (!operationId) {
        throw new Error("SMS doğrulama başlatılamadı. Lütfen tekrar dene.");
      }

      const nextPending: PendingInvoiceState = {
        ...pending,
        signing: {
          status: "otp_sent",
          phone,
          phone_masked: maskPhone(phone),
          operation_id: operationId,
          otp_requested_at: new Date().toISOString(),
          otp_verified_at: undefined,
        },
      };
      await savePendingInvoice(supabase, conversationId, nextPending);

      return {
        status: "otp_sent",
        draft_uuid: draft.uuid,
        phone_masked: nextPending.signing?.phone_masked ?? maskPhone(phone),
        operation_id: operationId,
      };
    }

    case "verify_invoice_sign_otp": {
      const pending = await loadPendingInvoice(supabase, conversationId);
      const draft = pending?.draft;
      if (!draft?.uuid) {
        throw new Error("Doğrulanacak taslak fatura bulunamadı.");
      }
      const operationId = pending?.signing?.operation_id;
      if (!operationId) {
        throw new Error("Doğrulama işlemi bulunamadı. Önce SMS kodu iste.");
      }
      const code =
        typeof input.code === "string"
          ? input.code.trim()
          : typeof input.sms_code === "string"
            ? (input.sms_code as string).trim()
            : "";
      if (!code) throw new Error("SMS doğrulama kodu gerekli.");

      await faturaVerifySignSMSCode(username, code, operationId);

      const nextPending: PendingInvoiceState = {
        ...pending,
        signing: {
          ...(pending?.signing ?? {}),
          status: "otp_verified",
          otp_verified_at: new Date().toISOString(),
        },
      };
      await savePendingInvoice(supabase, conversationId, nextPending);

      return { status: "otp_verified", draft_uuid: draft.uuid };
    }

    case "confirm_invoice_issue": {
      const pending = await loadPendingInvoice(supabase, conversationId);
      const draft = pending?.draft;
      if (!draft?.date || !draft?.uuid) {
        throw new Error("Onay bekleyen bir fatura taslağı bulunamadı.");
      }
      if (pending?.signing?.status !== "otp_verified") {
        throw new Error("İmzalama için SMS doğrulama tamamlanmadı.");
      }

      const issued = await faturaConfirmInvoiceIssue(username, {
        date: draft.date,
        uuid: draft.uuid,
      });
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
            issue_date: draft.date,
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
          gib_username: username,
          invoice_uuid: issued.uuid,
          direction: "outgoing",
          issue_date: draft.date.split("/").reverse().join("-"),
          status: "approved",
          currency: pending?.request?.currency ?? "TRY",
          gross_total: grossTotal,
          vat_total: vatTotal,
          net_total: netTotal,
          customer_tax_id: pending?.request?.buyer_tax_id ?? null,
          customer_name: pending?.request?.buyer_name ?? null,
          raw_payload: {
            source: "confirm_invoice_issue",
            draft,
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
      const hasFilters =
        !!filters.customerName ||
        typeof filters.amountGte === "number" ||
        typeof filters.amountEq === "number";
      if (!hasFilters) {
        return faturaListInvoices(username, range.startDate, range.endDate);
      }

      await syncFactsForRange(
        supabase,
        username,
        range.startDate,
        range.endDate,
        "outgoing",
      );
      let query = supabase
        .from("invoice_facts")
        .select("raw_payload")
        .eq("gib_username", username)
        .eq("direction", "outgoing")
        .gte("issue_date", toIsoDate(range.startDate))
        .lte("issue_date", toIsoDate(range.endDate))
        .order("issue_date", { ascending: false })
        .limit(100);
      query = applyFactFiltersToQuery(query, filters);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map(
        (row: { raw_payload: unknown }) => row.raw_payload,
      );
    }

    case "invoice_totals": {
      const range = resolveDateRange(input, userMessage, "month");
      if (!range) throw new Error("Tarih aralığı belirlenemedi.");
      await syncFactsForRange(
        supabase,
        username,
        range.startDate,
        range.endDate,
        "outgoing",
      );
      let query = supabase
        .from("invoice_facts")
        .select("gross_total, vat_total, net_total")
        .eq("gib_username", username)
        .eq("direction", "outgoing")
        .eq("status", "approved")
        .gte("issue_date", toIsoDate(range.startDate))
        .lte("issue_date", toIsoDate(range.endDate));
      query = applyFactFiltersToQuery(query, filters);
      const { data, error } = await query;
      if (error) throw error;
      const totals = (data ?? []).reduce(
        (
          acc: {
            count_total: number;
            sum_gross_total: number;
            sum_vat_total: number;
            sum_net_total: number;
          },
          row: {
            gross_total: number | null;
            vat_total: number | null;
            net_total: number | null;
          },
        ) => {
          acc.count_total += 1;
          acc.sum_gross_total += row.gross_total ?? 0;
          acc.sum_vat_total += row.vat_total ?? 0;
          acc.sum_net_total += row.net_total ?? 0;
          return acc;
        },
        {
          count_total: 0,
          sum_gross_total: 0,
          sum_vat_total: 0,
          sum_net_total: 0,
        },
      );
      return { start_date: range.startDate, end_date: range.endDate, totals };
    }

    case "latest_invoice": {
      const range = resolveDateRange(input, userMessage, "none");
      if (range) {
        await syncFactsForRange(
          supabase,
          username,
          range.startDate,
          range.endDate,
          "outgoing",
        );
      } else {
        const month = resolveDateRange({}, userMessage, "month")!;
        await syncFactsForRange(
          supabase,
          username,
          month.startDate,
          month.endDate,
          "outgoing",
        );
      }

      let query = supabase
        .from("invoice_facts")
        .select(
          "invoice_uuid, issue_date, status, currency, gross_total, vat_total, net_total, customer_tax_id, customer_name",
        )
        .eq("gib_username", username)
        .eq("direction", "outgoing")
        .order("issue_date", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(1);
      if (range) {
        query = query
          .gte("issue_date", toIsoDate(range.startDate))
          .lte("issue_date", toIsoDate(range.endDate));
      }
      query = applyFactFiltersToQuery(query, filters);
      const { data, error } = await query;
      if (error) throw error;
      return {
        reference_date: formatTrDate(istanbulTodayUtc()),
        invoice: Array.isArray(data) ? (data[0] ?? null) : null,
      };
    }

    case "export_invoices_excel": {
      const range = resolveDateRange(input, userMessage, "month");
      if (!range) throw new Error("Tarih aralığı belirlenemedi.");
      return await createInvoicesExcelExport({
        supabase,
        username,
        startDateTr: range.startDate,
        endDateTr: range.endDate,
        direction: "outgoing",
        filters: {
          customerName: filters.customerName,
          amountGte: filters.amountGte,
          amountEq: filters.amountEq,
        },
      });
    }

    case "cancel_invoice":
      return faturaCancelInvoice(
        username,
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
  username: string,
  userMessage: string,
  conversationId: string,
  logMeta?: ToolCallLogMeta,
): Promise<unknown> {
  const startedAt = Date.now();
  const { ndjsonWriter, ...metaRest } = logMeta ?? {};
  const logBase = {
    tool: toolName,
    conversation_id: conversationId,
    gib_username: username,
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
      username,
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
