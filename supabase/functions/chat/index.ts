import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import {
  extractGibUserDataStringPatch,
  faturaCancelInvoice,
  faturaConfirmInvoiceIssue,
  faturaCreateInvoicePreview,
  faturaGetInvoiceHtml,
  faturaGetUserData,
  faturaGetInvoicesIssuedToMe,
  faturaListInvoices,
  faturaLookupRecipient,
  faturaSendSignSMSCode,
  faturaUpdateUserData,
  faturaVerifySignSMSCode,
  mapInvoicesToFacts,
  mergeGibUserDataPatch,
} from "../_shared/gib.ts";
import {
  getSubjectFromAuthHeader,
  SessionAuthError,
} from "../_shared/session-auth.ts";
import { SYSTEM_PROMPT, TOOLS } from "../_shared/tools.ts";
import { normalizeTurkish } from "../_shared/turkish.ts";
import {
  clientWantsNdjsonStream,
  encodeNdjsonEvent,
  NDJSON_CONTENT_TYPE,
} from "./ndjson-stream.ts";
import type {
  ChatAction,
  InvoiceDetailPayload,
  InvoiceSearchFilters,
  PendingInvoiceState,
} from "./types.ts";

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! });

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const ISTANBUL_TZ = "Europe/Istanbul";

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "***";
  return `*** *** ** ${digits.slice(-2)}`;
}

function istanbulTodayUtc(): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ISTANBUL_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatTrDate(dateUtc: Date): string {
  const day = String(dateUtc.getUTCDate()).padStart(2, "0");
  const month = String(dateUtc.getUTCMonth() + 1).padStart(2, "0");
  const year = dateUtc.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

function parseTrDate(value: string): Date | null {
  const m = value.trim().match(/^(\d{2})[./-](\d{2})[./-](\d{2,4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3].length === 2 ? `20${m[3]}` : m[3]);
  if (year < 2000 || month < 1 || month > 12 || day < 1 || day > 31)
    return null;
  return new Date(Date.UTC(year, month - 1, day));
}

function resolveDateRangeFromText(
  text: string,
): { startDate: string; endDate: string } | null {
  const lower = text.toLocaleLowerCase("tr-TR");
  const today = istanbulTodayUtc();

  const rangeMatch = lower.match(
    /(\d{2}[./-]\d{2}[./-]\d{2,4})\s*(?:-|–|—| ile | to )\s*(\d{2}[./-]\d{2}[./-]\d{2,4})/,
  );
  if (rangeMatch) {
    const start = parseTrDate(rangeMatch[1]);
    const end = parseTrDate(rangeMatch[2]);
    if (start && end)
      return { startDate: formatTrDate(start), endDate: formatTrDate(end) };
  }

  const explicit = lower.match(/\b(\d{2}[./-]\d{2}[./-]\d{2,4})\b/);
  if (explicit) {
    const day = parseTrDate(explicit[1]);
    if (day)
      return { startDate: formatTrDate(day), endDate: formatTrDate(day) };
  }

  if (
    lower.includes("bu ay") ||
    lower.includes("ayın başından") ||
    lower.includes("ay başından")
  ) {
    const start = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1),
    );
    return { startDate: formatTrDate(start), endDate: formatTrDate(today) };
  }

  if (lower.includes("bugün")) {
    return { startDate: formatTrDate(today), endDate: formatTrDate(today) };
  }

  if (lower.includes("dün")) {
    const yesterday = new Date(today);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    return {
      startDate: formatTrDate(yesterday),
      endDate: formatTrDate(yesterday),
    };
  }

  if (lower.includes("geçen hafta") || lower.includes("gecen hafta")) {
    const currentWeekday = (today.getUTCDay() + 6) % 7;
    const startOfThisWeek = new Date(today);
    startOfThisWeek.setUTCDate(today.getUTCDate() - currentWeekday);
    const startOfLastWeek = new Date(startOfThisWeek);
    startOfLastWeek.setUTCDate(startOfThisWeek.getUTCDate() - 7);
    const endOfLastWeek = new Date(startOfLastWeek);
    endOfLastWeek.setUTCDate(startOfLastWeek.getUTCDate() + 6);
    return {
      startDate: formatTrDate(startOfLastWeek),
      endDate: formatTrDate(endOfLastWeek),
    };
  }

  if (lower.includes("bu yıl") || lower.includes("bu yil")) {
    const start = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
    return { startDate: formatTrDate(start), endDate: formatTrDate(today) };
  }

  return null;
}

function resolveDateRange(
  input: Record<string, unknown>,
  userMessage: string,
  fallback: "month" | "none" = "month",
): { startDate: string; endDate: string } | null {
  if (
    typeof input.start_date === "string" &&
    typeof input.end_date === "string"
  ) {
    return { startDate: input.start_date, endDate: input.end_date };
  }
  const parsed = resolveDateRangeFromText(userMessage);
  if (parsed) return parsed;
  if (fallback === "none") return null;
  const today = istanbulTodayUtc();
  const start = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1),
  );
  return { startDate: formatTrDate(start), endDate: formatTrDate(today) };
}

function shouldOfferInvoicesAction(
  userMessage: string,
  usedTools: Set<string>,
): boolean {
  if (usedTools.has("list_invoices")) return true;
  if (usedTools.has("list_invoices_received")) return true;
  const lower = userMessage.toLocaleLowerCase("tr-TR");
  return (
    (lower.includes("fatura") || lower.includes("liste")) &&
    (lower.includes("göster") ||
      lower.includes("goster") ||
      lower.includes("listele"))
  );
}

function isUserProfileIntent(userMessage: string): boolean {
  const lower = userMessage.toLocaleLowerCase("tr-TR");
  return (
    lower.includes("profilim") ||
    lower.includes("firma bilgilerim") ||
    lower.includes("kullanıcı bilgilerim") ||
    lower.includes("kullanici bilgilerim") ||
    lower.includes("bilgilerimi getir")
  );
}

function summarizeUserProfile(profile: {
  taxIDOrTRID?: string;
  title?: string;
  name?: string;
  surname?: string;
  taxOffice?: string;
  email?: string;
  phoneNumber?: string;
}): string {
  const displayName =
    profile.title?.trim() ||
    [profile.name, profile.surname].filter(Boolean).join(" ").trim() ||
    "Kayıtlı kullanıcı";
  const rows = [
    `- Ünvan/Ad: ${displayName}`,
    profile.taxIDOrTRID ? `- VKN/TCKN: ${profile.taxIDOrTRID}` : null,
    profile.taxOffice ? `- Vergi dairesi: ${profile.taxOffice}` : null,
    profile.phoneNumber ? `- Telefon: ${maskPhone(profile.phoneNumber)}` : null,
    profile.email ? `- E-posta: ${profile.email}` : null,
  ].filter(Boolean);
  return `GİB profil bilgilerin:\n${rows.join("\n")}`;
}

function classifyGibOperationError(
  err: unknown,
  toolName: string,
): { code: string; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLocaleLowerCase("tr-TR");

  if (toolName === "lookup_recipient" || toolName === "create_invoice") {
    if (
      lower.includes("vkn") ||
      lower.includes("tckn") ||
      (lower.includes("vergi") &&
        (lower.includes("geçersiz") ||
          lower.includes("hatalı") ||
          lower.includes("bulunamadı")))
    ) {
      return {
        code: "INVALID_TAX_ID",
        message: "VKN veya TCKN geçersiz ya da sistemde kayıtlı değil.",
      };
    }
  }
  if (
    lower.includes("tarih") &&
    (lower.includes("geçersiz") ||
      lower.includes("hatalı") ||
      lower.includes("ileri"))
  ) {
    return {
      code: "INVALID_DATE",
      message:
        "Fatura tarihi geçersiz. Bugünün tarihi veya geçmiş bir tarih kullan.",
    };
  }
  if (
    lower.includes("timeout") ||
    lower.includes("econnrefused") ||
    lower.includes("network") ||
    lower.includes("servis kullanılamıyor") ||
    lower.includes("bağlantı hatası")
  ) {
    return {
      code: "GIB_UNAVAILABLE",
      message:
        "GİB sistemine şu an ulaşılamıyor. Birkaç dakika sonra tekrar dene.",
    };
  }
  if (
    lower.includes("oturum") &&
    (lower.includes("geçersiz") || lower.includes("sona"))
  ) {
    return {
      code: "SESSION_EXPIRED",
      message:
        "GİB oturumu sona erdi. Lütfen uygulamayı yeniden başlat veya tekrar giriş yap.",
    };
  }
  return { code: "GIB_ERROR", message: raw };
}

/** DB'ye yazılacak action: HTML ve geçici OTP UI'sı çıkarılır (boyut ve süre dolmuş kartlar). */
function persistableAction(
  action: ChatAction | null,
): Record<string, unknown> | null {
  if (!action) return null;
  if (action.type === "open_sign_otp") return null;
  if (action.type === "open_invoice_preview") {
    return {
      type: action.type,
      label: action.label,
      preview: {
        uuid: action.preview?.uuid,
        title: action.preview?.title ?? "Önizleme",
        issued:
          typeof action.preview?.issued === "boolean"
            ? action.preview.issued
            : false,
      },
    };
  }
  try {
    return JSON.parse(JSON.stringify(action)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function assistantFallbackForAction(action: ChatAction | null): string {
  if (!action) return "";
  switch (action.type) {
    case "open_invoice_preview":
      return "Önizleme hazır — alttaki düğmeyle açıp kontrol edebilirsin.";
    case "open_invoices":
      return "Fatura listesi hazır — alttaki düğmeyle ekranı açabilirsin.";
    case "open_invoice_detail":
      return "Seçilen fatura için detay düğmesine dokunabilirsin.";
    default:
      return "";
  }
}

function parseAmount(value: string): number | null {
  const normalized = value.replace(/\./g, "").replace(",", ".").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseFiltersFromText(text: string): InvoiceSearchFilters {
  const filters: InvoiceSearchFilters = {};
  const lower = normalizeTurkish(text);

  const aboveMatch = lower.match(
    /(\d[\d.,]*)\s*(tl|₺|try)?\s*(uzeri|ustunde|ustu|ve ustu)/,
  );
  if (aboveMatch) {
    const amount = parseAmount(aboveMatch[1]);
    if (amount !== null) filters.amountGte = amount;
  }

  const exactMatch = lower.match(/(?:en son|son)\s+(\d[\d.,]*)\s*(tl|₺|try)/);
  if (exactMatch) {
    const amount = parseAmount(exactMatch[1]);
    if (amount !== null) filters.amountEq = amount;
  }

  const customerMatch =
    text.match(
      /([A-Za-zÇĞİÖŞÜçğıöşü\s]+?)\s+(beye|bey|hanıma|hanima|hanim|bayan|beye)\b/i,
    ) ??
    text.match(/([A-Za-zÇĞİÖŞÜçğıöşü\s]+?)['']?(?:ya|ye)\s+kesti/i) ??
    text.match(/([A-Za-zÇĞİÖŞÜçğıöşü\s]+?)\s+(?:adına|adina)/i);

  if (customerMatch?.[1]) {
    const raw = customerMatch[1].trim().replace(/\s+/g, " ");
    const cleaned = raw.split(" ").slice(-2).join(" ");
    if (cleaned.length >= 3) filters.customerName = cleaned;
  }

  return filters;
}

async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  username: string,
  userMessage: string,
  conversationId: string,
): Promise<unknown> {
  const toIsoDate = (trDate: string): string => {
    const m = trDate.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) throw new Error("Tarih formatı GG/AA/YYYY olmalıdır.");
    return `${m[3]}-${m[2]}-${m[1]}`;
  };

  const syncFactsForRange = async (
    startDate: string,
    endDate: string,
    factDirection: "outgoing" | "incoming",
  ) => {
    const invoices =
      factDirection === "outgoing"
        ? await faturaListInvoices(username, startDate, endDate)
        : await faturaGetInvoicesIssuedToMe(username, startDate, endDate);
    const facts = mapInvoicesToFacts(
      username,
      invoices as unknown[],
      factDirection,
    );
    if (facts.length === 0) return;
    const { error } = await supabase
      .from("invoice_facts")
      .upsert(facts, { onConflict: "gib_username,invoice_uuid,direction" });
    if (error) throw error;
  };

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

  const applyFactFilters = (query: ReturnType<typeof supabase.from>) => {
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
  };

  switch (toolName) {
    case "get_user_profile":
      return faturaGetUserData(username);

    case "update_user_profile": {
      const picked = extractGibUserDataStringPatch(input);
      if (Object.keys(picked).length === 0) {
        throw new Error(
          "Güncellenecek alan belirtilmedi. Hangi bilgiyi değiştirmek istediğini yaz.",
        );
      }
      const current = await faturaGetUserData(username);
      const merged = mergeGibUserDataPatch(current, picked);
      await faturaUpdateUserData(username, merged);
      return faturaGetUserData(username);
    }

    case "lookup_recipient":
      return faturaLookupRecipient(username, input.tax_id as string);

    case "create_invoice": {
      const items = input.items as {
        name: string;
        quantity: number;
        unit: string;
        unit_price: number;
        vat_rate: number;
      }[];
      const preview = await faturaCreateInvoicePreview(username, {
        buyerName: input.buyer_name as string,
        buyerTaxId: input.buyer_tax_id as string | undefined,
        buyerAddress: input.buyer_address as string | undefined,
        items: items.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          unit: i.unit,
          unitPrice: i.unit_price,
          vatRate: i.vat_rate,
        })),
        date: input.date as string | undefined,
        currency: input.currency as string | undefined,
      });

      await supabase
        .from("conversations")
        .update({
          pending_invoice: {
            draft: preview.draft,
            request: input,
            preview_html: preview.html,
            created_at: new Date().toISOString(),
          },
        })
        .eq("id", conversationId);

      return {
        status: "preview_ready",
        draft_uuid: preview.draft.uuid,
        message: 'Fatura taslağı hazır. Kesmem için "onaylıyorum" yaz.',
      };
    }

    case "request_invoice_sign_otp": {
      const { data: conv, error: convError } = await supabase
        .from("conversations")
        .select("pending_invoice")
        .eq("id", conversationId)
        .single();
      if (convError) throw convError;

      const pending =
        (conv?.pending_invoice as PendingInvoiceState | null) ?? {};
      const draft = pending?.draft;
      if (!draft?.uuid)
        throw new Error("İmzalanacak taslak fatura bulunamadı.");

      const phoneCandidate =
        (typeof input.phone === "string" && input.phone.trim()) ||
        pending.signing?.phone ||
        (await faturaGetUserData(username))?.phoneNumber;
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
      if (!operationId)
        throw new Error("SMS doğrulama başlatılamadı. Lütfen tekrar dene.");

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
      await supabase
        .from("conversations")
        .update({ pending_invoice: nextPending })
        .eq("id", conversationId);

      return {
        status: "otp_sent",
        draft_uuid: draft.uuid,
        phone_masked: nextPending.signing?.phone_masked ?? maskPhone(phone),
        operation_id: operationId,
      };
    }

    case "verify_invoice_sign_otp": {
      const { data: conv, error: convError } = await supabase
        .from("conversations")
        .select("pending_invoice")
        .eq("id", conversationId)
        .single();
      if (convError) throw convError;

      const pending = conv?.pending_invoice as PendingInvoiceState | null;
      const draft = pending?.draft;
      if (!draft?.uuid)
        throw new Error("Doğrulanacak taslak fatura bulunamadı.");
      const operationId = pending?.signing?.operation_id;
      if (!operationId)
        throw new Error("Doğrulama işlemi bulunamadı. Önce SMS kodu iste.");
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
      await supabase
        .from("conversations")
        .update({ pending_invoice: nextPending })
        .eq("id", conversationId);

      return { status: "otp_verified", draft_uuid: draft.uuid };
    }

    case "confirm_invoice_issue": {
      const { data: conv, error: convError } = await supabase
        .from("conversations")
        .select("pending_invoice")
        .eq("id", conversationId)
        .single();
      if (convError) throw convError;
      const pending = conv?.pending_invoice as PendingInvoiceState | null;
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

      await supabase
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

      await syncFactsForRange(range.startDate, range.endDate, "outgoing");
      let query = supabase
        .from("invoice_facts")
        .select("raw_payload")
        .eq("gib_username", username)
        .eq("direction", "outgoing")
        .gte("issue_date", toIsoDate(range.startDate))
        .lte("issue_date", toIsoDate(range.endDate))
        .order("issue_date", { ascending: false })
        .limit(100);
      query = applyFactFilters(
        query as ReturnType<typeof supabase.from>,
      ) as typeof query;
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map(
        (row: { raw_payload: unknown }) => row.raw_payload,
      );
    }

    case "list_invoices_received": {
      const range = resolveDateRange(input, userMessage, "month");
      if (!range) throw new Error("Tarih aralığı belirlenemedi.");
      const hasFilters =
        !!filters.customerName ||
        typeof filters.amountGte === "number" ||
        typeof filters.amountEq === "number";
      if (!hasFilters) {
        return faturaGetInvoicesIssuedToMe(
          username,
          range.startDate,
          range.endDate,
        );
      }

      await syncFactsForRange(range.startDate, range.endDate, "incoming");
      let query = supabase
        .from("invoice_facts")
        .select("raw_payload")
        .eq("gib_username", username)
        .eq("direction", "incoming")
        .gte("issue_date", toIsoDate(range.startDate))
        .lte("issue_date", toIsoDate(range.endDate))
        .order("issue_date", { ascending: false })
        .limit(100);
      query = applyFactFilters(
        query as ReturnType<typeof supabase.from>,
      ) as typeof query;
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map(
        (row: { raw_payload: unknown }) => row.raw_payload,
      );
    }

    case "invoice_totals": {
      const range = resolveDateRange(input, userMessage, "month");
      if (!range) throw new Error("Tarih aralığı belirlenemedi.");
      await syncFactsForRange(range.startDate, range.endDate, "outgoing");
      let query = supabase
        .from("invoice_facts")
        .select("gross_total, vat_total, net_total")
        .eq("gib_username", username)
        .eq("direction", "outgoing")
        .eq("status", "approved")
        .gte("issue_date", toIsoDate(range.startDate))
        .lte("issue_date", toIsoDate(range.endDate));
      query = applyFactFilters(
        query as ReturnType<typeof supabase.from>,
      ) as typeof query;
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
        await syncFactsForRange(range.startDate, range.endDate, "outgoing");
      } else {
        const month = resolveDateRange({}, userMessage, "month")!;
        await syncFactsForRange(month.startDate, month.endDate, "outgoing");
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
      query = applyFactFilters(
        query as ReturnType<typeof supabase.from>,
      ) as typeof query;
      const { data, error } = await query;
      if (error) throw error;
      return {
        reference_date: formatTrDate(istanbulTodayUtc()),
        invoice: Array.isArray(data) ? (data[0] ?? null) : null,
      };
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

const MAX_AGENT_ROUNDS = 28;

/** Same contract string as embedded in assistant loop (YAML-like rules for Claude output). */
const RESPONSE_CONTRACT_AGENT = `Yanit stili:
- Konusma dili kullan; rapor/excel dili kullanma.
- Zorunlu sabit basliklar ("Istek", "Sonuc", "Tarih Araligi", "Sonraki Adim") kullanma.
- Gerekirse tarihi cumle icinde dogalca belirt.
- Tutar/KDV gibi sayisal degerleri sadece arac sonucundan kullan; tahmin etme.
- Markdown tablo kullanma; gerekiyorsa kisa madde listesi kullan.
- Kullanici "bu ay", "ayin basindan beri", "dun", "gecen hafta" derse tarih sormadan ilgili araci cagir.
- Cevabi kisa tut (genelde 2-5 cumle).

Fatura arama/filtreleme:
- list_invoices aracindan bos sonuc gelirse, kullanilan tarih ve filtre kriterlerini kullaniciya bildir (ornek: "Ahmet icin bu ay fatura bulunamadi").
- list_invoices_received (gelen) icin de ayni sekilde bos sonucta tarih ve filtreleri belirt; kesilen faturalarla karistirma.
- Fatura listesi getirince kullanilan tarih araligini ve varsa filtreler dogal sekilde belirt.
- Kullanici "profilim", "firma bilgilerim", "kullanici bilgilerim", "bilgilerimi getir" derse mutlaka get_user_profile aracini cagir.

Hata yonetimi (arac sonucunda "error_code" varsa):
- INVALID_TAX_ID: "Bu VKN/TCKN gecersiz gorunuyor, numarayi kontrol eder misin?" diye sor.
- INVALID_DATE: "Tarih formati yanlis — GG/AA/YYYY formatinda girer misin?" de.
- GIB_UNAVAILABLE: "GIB su an yanit vermiyor, biraz bekleyip tekrar deneyelim." de.
- SESSION_EXPIRED: "Oturumun sona ermis gibi gorunuyor, uygulamayi kapatip tekrar acmayi dene." de.
- GIB_ERROR veya diger: Hata mesajini dogal Turkce ile ozetle, kullanici ne yapmasi gerektigini acikla.
- Hata sonrasi ne yapilabilecegini mutlaka belirt; "tekrar deneyin" yerine somut adim oner.`;

function buildDynamicSystemPromptForAgent(): string {
  return `${SYSTEM_PROMPT}

Bugunun tarihi: ${formatTrDate(istanbulTodayUtc())}
Saat dilimi: ${ISTANBUL_TZ}
${RESPONSE_CONTRACT_AGENT}`;
}

type AgentLoopAccumulator = {
  assistantText: string;
  usedFinanceTool: boolean;
  usedToolNames: Set<string>;
  latestInvoiceActionPayload: InvoiceDetailPayload | null;
  lastListInvoicesInput: Record<string, unknown> | null;
  lastListInvoicesReceivedInput: Record<string, unknown> | null;
};

async function runAnthropicToolLoop(
  claudeMessages: Anthropic.MessageParam[],
  username: string,
  userMsg: string,
  convId: string,
  dynamicSystemPrompt: string,
  ndjsonWriter: WritableStreamDefaultWriter<Uint8Array> | null,
): Promise<AgentLoopAccumulator> {
  let assistantText = "";
  let usedFinanceTool = false;
  const usedToolNames = new Set<string>();
  let latestInvoiceActionPayload: InvoiceDetailPayload | null = null;
  let lastListInvoicesInput: Record<string, unknown> | null = null;
  let lastListInvoicesReceivedInput: Record<string, unknown> | null = null;

  const anthropicRoundParams =
    (): Anthropic.MessageCreateParamsNonStreaming => ({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1536,
      system: [
        {
          type: "text",
          text: dynamicSystemPrompt,
          // @ts-ignore - cache_control for prompt caching
          cache_control: { type: "ephemeral" },
        },
      ],
      tools: TOOLS.map((t, i) =>
        i === TOOLS.length - 1
          ? {
            ...t,
            cache_control: {
              type: "ephemeral",
            } as Anthropic.CacheControlEphemeral,
          }
          : t,
      ),
      messages: claudeMessages,
    });

  for (let round = 0; round < MAX_AGENT_ROUNDS; round++) {
    const params = anthropicRoundParams();
    const roundPieces: string[] = [];
    let response: Anthropic.Message;

    if (ndjsonWriter) {
      const stream = anthropic.messages.stream(params);
      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          roundPieces.push(event.delta.text);
        }
      }
      response = await stream.finalMessage();
    } else {
      response = await anthropic.messages.create(params);
    }

    const textParts = response.content
      .filter((b: Anthropic.ContentBlock) => b.type === "text")
      .map((b: Anthropic.ContentBlock) => (b as Anthropic.TextBlock).text);
    if (textParts.length) assistantText = textParts.join("");

    if (response.stop_reason === "end_turn") {
      if (ndjsonWriter && roundPieces.length > 0) {
        const full = roundPieces.join("");
        const step = 96;
        for (let i = 0; i < full.length; i += step) {
          await ndjsonWriter.write(
            encodeNdjsonEvent({
              type: "delta",
              text: full.slice(i, i + step),
            }),
          );
        }
      }
      break;
    }

    if (response.stop_reason === "tool_use") {
      const toolUseBlocks = response.content.filter(
        (b: Anthropic.ContentBlock) => b.type === "tool_use",
      ) as Anthropic.ToolUseBlock[];

      if (ndjsonWriter && toolUseBlocks.length > 0) {
        const label = toolUseBlocks.map((b) => b.name).join(",");
        await ndjsonWriter.write(
          encodeNdjsonEvent({ type: "tool", phase: "start", name: label }),
        );
      }

      claudeMessages.push({ role: "assistant", content: response.content });

      const toolResults = await Promise.all(
        toolUseBlocks.map(async (block) => {
          let content: string;
          try {
            const result = await executeTool(
              block.name,
              block.input as Record<string, unknown>,
              username,
              userMsg,
              convId,
            );
            if (
              block.name === "invoice_totals" ||
              block.name === "latest_invoice"
            ) {
              usedFinanceTool = true;
            }
            if (
              block.name === "latest_invoice" &&
              result &&
              typeof result === "object" &&
              (result as { invoice?: InvoiceDetailPayload }).invoice
            ) {
              latestInvoiceActionPayload = (
                result as { invoice: InvoiceDetailPayload }
              ).invoice;
            }
            if (block.name === "list_invoices") {
              lastListInvoicesInput = block.input as Record<string, unknown>;
            }
            if (block.name === "list_invoices_received") {
              lastListInvoicesReceivedInput =
                block.input as Record<string, unknown>;
            }
            usedToolNames.add(block.name);
            content = JSON.stringify(result);
          } catch (err) {
            const classified = classifyGibOperationError(err, block.name);
            content = JSON.stringify({
              error: classified.message,
              error_code: classified.code,
            });
          }
          return {
            type: "tool_result" as const,
            tool_use_id: block.id,
            content,
          };
        }),
      );

      claudeMessages.push({ role: "user", content: toolResults });

      if (ndjsonWriter && toolUseBlocks.length > 0) {
        const label = toolUseBlocks.map((b) => b.name).join(",");
        await ndjsonWriter.write(
          encodeNdjsonEvent({ type: "tool", phase: "end", name: label }),
        );
      }
      continue;
    }

    break;
  }

  return {
    assistantText,
    usedFinanceTool,
    usedToolNames,
    latestInvoiceActionPayload,
    lastListInvoicesInput,
    lastListInvoicesReceivedInput,
  };
}

async function finalizeAgentAssistant(opts: {
  convId: string;
  username: string;
  userMessage: string;
  assistantText: string;
  usedFinanceTool: boolean;
  usedToolNames: Set<string>;
  latestInvoiceActionPayload: InvoiceDetailPayload | null;
  lastListInvoicesInput: Record<string, unknown> | null;
  lastListInvoicesReceivedInput: Record<string, unknown> | null;
}): Promise<{ finalAssistant: string; action: ChatAction | null }> {
  const {
    convId,
    username,
    userMessage,
    assistantText,
    usedFinanceTool,
    usedToolNames,
    latestInvoiceActionPayload,
    lastListInvoicesInput,
    lastListInvoicesReceivedInput,
  } = opts;

  let trimmedAssistant = assistantText;
  if (
    !usedToolNames.has("get_user_profile") &&
    isUserProfileIntent(userMessage)
  ) {
    try {
      const profile = await faturaGetUserData(username);
      trimmedAssistant = summarizeUserProfile(profile);
      usedToolNames.add("get_user_profile");
    } catch {
      // Allow the normal model answer when profile fetch fails.
    }
  }

  if (trimmedAssistant && usedFinanceTool) {
    trimmedAssistant = trimmedAssistant
      .replace(/\n{3,}/g, "\n\n")
      .replace(/\*\*(İstek|Sonuç|Tarih Aralığı|Sonraki Adım):\*\*/g, "")
      .trim();
  }

  const latestInvSnap =
    latestInvoiceActionPayload as InvoiceDetailPayload | null;
  if (usedToolNames.has("latest_invoice") && latestInvSnap?.invoice_uuid) {
    await supabase
      .from("conversations")
      .update({
        last_invoice: {
          uuid: latestInvSnap.invoice_uuid,
          issue_date: latestInvSnap.issue_date,
          status: latestInvSnap.status,
          currency: latestInvSnap.currency,
          gross_total: latestInvSnap.gross_total,
          vat_total: latestInvSnap.vat_total,
          net_total: latestInvSnap.net_total,
          customer_tax_id: latestInvSnap.customer_tax_id,
          customer_name: latestInvSnap.customer_name,
        },
      })
      .eq("id", convId);
  }

  const { data: convState } = await supabase
    .from("conversations")
    .select("pending_invoice,last_invoice")
    .eq("id", convId)
    .single();
  const pending = convState?.pending_invoice as PendingInvoiceState | null;
  const last = convState?.last_invoice as {
    uuid?: string;
    html?: string;
    issue_date?: string;
    status?: string;
    currency?: string;
    gross_total?: number;
    vat_total?: number;
    net_total?: number;
    customer_tax_id?: string;
    customer_name?: string;
  } | null;

  let action: ChatAction | null = null;
  const msgNorm = normalizeTurkish(String(userMessage ?? ""));
  const wantsPreviewOrDownload =
    /\bfatura(yi)?\s*(gor|goster|goruntule|ac)\b/i.test(msgNorm) ||
    /\b(onizle|pdf|indir|goster|goruntule|tam\s*fatura|paylas)\b/i.test(
      msgNorm,
    );
  if (wantsPreviewOrDownload || usedToolNames.has("create_invoice")) {
    if (pending?.draft?.uuid) {
      try {
        const html =
          typeof pending.preview_html === "string" &&
            pending.preview_html.length > 0
            ? pending.preview_html
            : await faturaGetInvoiceHtml(username, pending.draft.uuid, false);
        action = {
          type: "open_invoice_preview",
          label: "Onizleme PDF",
          preview: {
            title: "Taslak Fatura Önizleme",
            html,
            uuid: pending.draft.uuid,
            issued: false,
          },
        };
      } catch (err) {
        console.error("pending draft preview html failed", err);
      }
    } else if (last?.uuid) {
      try {
        const statusLower =
          typeof last.status === "string" ? last.status.toLowerCase() : "";
        const useSignedHtml =
          statusLower.includes("approved") || statusLower.includes("onay");
        const html =
          typeof last.html === "string" && last.html.length > 0
            ? last.html
            : await faturaGetInvoiceHtml(username, last.uuid, useSignedHtml);
        action = {
          type: "open_invoice_preview",
          label: "Faturayi PDF Ac",
          preview: {
            title: useSignedHtml ? "Kesilmiş Fatura" : "Taslak / Önizleme",
            html,
            uuid: last.uuid,
            issued: useSignedHtml,
          },
        };
      } catch (err) {
        console.error("last_invoice preview html failed", err);
      }
    } else if (latestInvSnap?.invoice_uuid) {
      try {
        const inv = latestInvSnap;
        const issued = inv.status === "approved";
        const html = await faturaGetInvoiceHtml(
          username,
          inv.invoice_uuid,
          issued,
        );
        action = {
          type: "open_invoice_preview",
          label: issued ? "Faturayi Gor" : "Taslagi Gor",
          preview: {
            title: issued ? "Kesilmiş Fatura" : "Taslak Fatura Önizleme",
            html,
            uuid: inv.invoice_uuid,
            issued,
          },
        };
      } catch (err) {
        console.error("latest_invoice preview html failed", err);
      }
    }
  } else if (latestInvSnap?.invoice_uuid) {
    let detail: InvoiceDetailPayload = latestInvSnap;
    if (
      last?.uuid &&
      detail.invoice_uuid === last.uuid &&
      (detail.gross_total === null || detail.vat_total === null)
    ) {
      detail = {
        ...detail,
        issue_date: detail.issue_date ?? last.issue_date ?? null,
        status: detail.status || last.status || "approved",
        currency: detail.currency || last.currency || "TRY",
        gross_total: detail.gross_total ?? last.gross_total ?? null,
        vat_total: detail.vat_total ?? last.vat_total ?? null,
        net_total: detail.net_total ?? last.net_total ?? null,
        customer_tax_id:
          detail.customer_tax_id ?? last.customer_tax_id ?? null,
        customer_name: detail.customer_name ?? last.customer_name ?? null,
      };
    }
    action = {
      type: "open_invoice_detail",
      label: "Detayi Gor",
      invoice: detail,
    };
  } else if (shouldOfferInvoicesAction(userMessage, usedToolNames)) {
    const incomingPreferred = usedToolNames.has("list_invoices_received");
    const listInput: Record<string, unknown> = incomingPreferred
      ? (lastListInvoicesReceivedInput ?? {})
      : (lastListInvoicesInput ?? {});
    const parsedRange = resolveDateRange(
      listInput,
      userMessage,
      "month",
    );
    const msgFilters = parseFiltersFromText(userMessage);
    const toolAmountGte =
      typeof listInput.amount_gte === "number"
        ? listInput.amount_gte
        : typeof listInput.amount_gte === "string"
          ? parseAmount(listInput.amount_gte as string)
          : null;
    const toolAmountEq =
      typeof listInput.amount_eq === "number"
        ? listInput.amount_eq
        : typeof listInput.amount_eq === "string"
          ? parseAmount(listInput.amount_eq as string)
          : null;
    const toolCustomerName =
      typeof listInput.customer_name === "string" &&
        listInput.customer_name.trim()
        ? listInput.customer_name.trim()
        : undefined;
    if (parsedRange) {
      action = {
        type: "open_invoices",
        label: incomingPreferred ? "Gelen faturaları gör" : "Faturalari Gor",
        filter: {
          ...parsedRange,
          customerName: toolCustomerName ?? msgFilters.customerName,
          amountGte: toolAmountGte ?? msgFilters.amountGte,
          amountEq: toolAmountEq ?? msgFilters.amountEq,
          direction: incomingPreferred ? "incoming" : "outgoing",
        },
      };
    }
  }

  let finalAssistant = (trimmedAssistant || "").trim();
  if (!finalAssistant) {
    finalAssistant =
      assistantFallbackForAction(action) ||
      (usedToolNames.size > 0
        ? "İşlem tamam."
        : "Şu an yanıt oluşturamadım — ne yapmak istediğini tek cümleyle yazar mısın?");
  }

  return { finalAssistant, action };
}

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const username = await getSubjectFromAuthHeader(req);
    const body = await req.json() as {
      message?: string;
      conversationId?: string | null;
      action?: {
        type?: string;
        draftUuid?: string;
        smsCode?: string;
        phone?: string;
      };
      stream?: boolean;
    };
    const { message, conversationId, action: requestAction } = body;

    const hasMessage = typeof message === "string" && message.trim().length > 0;
    const hasAction = !!requestAction;
    if (!username || (!hasMessage && !hasAction)) {
      return Response.json(
        { error: "message zorunludur." },
        { headers: corsHeaders },
      );
    }

    // Ensure conversation exists
    let convId = conversationId;
    if (!convId) {
      const { data: conv, error } = await supabase
        .from("conversations")
        .insert({
          gib_username: username,
          title: String(message ?? "").slice(0, 60),
        })
        .select("id")
        .single();
      if (error) throw error;
      convId = conv.id;
    }

    if (typeof convId !== "string") {
      return Response.json(
        { error: "conversation id gerekli." },
        { headers: corsHeaders },
      );
    }

    const cid = convId;

    // Save user message
    await supabase.from("messages").insert({
      conversation_id: cid,
      role: "user",
      content: hasMessage ? message : "[action]",
    });

    const normalizedMessage = String(message ?? "")
      .toLocaleLowerCase("tr-TR")
      .trim();
    const isConfirmMessage =
      /\b(onayliyorum|onaylıyorum|onay|evet onay|devam)\b/.test(
        normalizedMessage,
      ) && !/\b(onaylama|onaysiz|onaysız)\b/.test(normalizedMessage);
    const isConfirmAction = requestAction?.type === "confirm_pending_invoice";
    const isRequestOtpAction = requestAction?.type === "request_sign_otp";
    const isVerifyOtpAction = requestAction?.type === "verify_sign_otp";

    // Deterministic fast-path: verify sms -> finalize issue
    if (isVerifyOtpAction) {
      const { data: convState, error: pendingErr } = await supabase
        .from("conversations")
        .select("pending_invoice")
        .eq("id", cid)
        .single();
      if (pendingErr) throw pendingErr;

      const pending = convState?.pending_invoice as PendingInvoiceState | null;
      if (pending?.draft?.date && pending?.draft?.uuid) {
        if (
          typeof requestAction?.draftUuid === "string" &&
          requestAction.draftUuid !== pending.draft.uuid
        ) {
          const mismatchMsg =
            "Doğrulanacak taslak değişmiş görünüyor. Lütfen en son önizleme kartını kullan.";
          await supabase.from("messages").insert({
            conversation_id: cid,
            role: "assistant",
            content: mismatchMsg,
          });
          return Response.json(
            { message: mismatchMsg, conversationId: cid, action: null },
            { headers: corsHeaders },
          );
        }
        try {
          await executeTool(
            "verify_invoice_sign_otp",
            { code: requestAction?.smsCode },
            username,
            message ?? "",
            cid,
          );
          const result = await executeTool(
            "confirm_invoice_issue",
            {},
            username,
            message ?? "",
            cid,
          );
          const payload = result as { uuid?: string; message?: string };
          const directMessage = payload?.uuid
            ? `SMS doğrulaması tamamlandı, fatura başarıyla kesildi.\n\nETTN: ${payload.uuid}\n\nİstersen şimdi "faturayı gör" veya "indir" diyebilirsin.`
            : (payload?.message ??
              "SMS doğrulaması tamamlandı, fatura kesildi.");

          await supabase.from("messages").insert({
            conversation_id: cid,
            role: "assistant",
            content: directMessage,
          });

          return Response.json(
            { message: directMessage, conversationId: cid, action: null },
            { headers: corsHeaders },
          );
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : "SMS doğrulaması başarısız.";
          const failText = `SMS doğrulaması başarısız oldu: ${msg}. Kodu kontrol edip tekrar deneyebilirsin.`;
          await supabase.from("messages").insert({
            conversation_id: cid,
            role: "assistant",
            content: failText,
          });
          return Response.json(
            { message: failText, conversationId: cid, action: null },
            { headers: corsHeaders },
          );
        }
      }
    }

    // Deterministic fast-path: if user confirms and a pending draft exists, start sms verification
    if (isConfirmMessage || isConfirmAction || isRequestOtpAction) {
      const { data: convState, error: pendingErr } = await supabase
        .from("conversations")
        .select("pending_invoice")
        .eq("id", cid)
        .single();
      if (pendingErr) throw pendingErr;

      const pending = convState?.pending_invoice as PendingInvoiceState | null;
      if (pending?.draft?.date && pending?.draft?.uuid) {
        if (
          (isConfirmAction || isRequestOtpAction) &&
          typeof requestAction?.draftUuid === "string" &&
          requestAction.draftUuid !== pending.draft.uuid
        ) {
          const mismatchMsg =
            "Onaylanacak taslak değişmiş görünüyor. Lütfen en son önizleme kartını kullan.";
          await supabase.from("messages").insert({
            conversation_id: cid,
            role: "assistant",
            content: mismatchMsg,
          });
          return Response.json(
            { message: mismatchMsg, conversationId: cid, action: null },
            { headers: corsHeaders },
          );
        }
        try {
          const result = await executeTool(
            "request_invoice_sign_otp",
            { phone: requestAction?.phone },
            username,
            message ?? "",
            cid,
          );
          const payload = result as {
            status?: string;
            draft_uuid?: string;
            phone_masked?: string;
          };
          const directMessage =
            payload?.status === "phone_required"
              ? "İmzalama için telefon numarası gerekli. Numaranı girip SMS kodunu isteyebilirsin."
              : `İmzalama için SMS doğrulama bekleniyor.${payload?.phone_masked ? ` Kod ${payload.phone_masked} numarasına gönderildi.` : ""}`;

          await supabase.from("messages").insert({
            conversation_id: cid,
            role: "assistant",
            content: directMessage,
          });

          return Response.json(
            {
              message: directMessage,
              conversationId: cid,
              action: payload?.draft_uuid
                ? {
                    type: "open_sign_otp",
                    label: "SMS Doğrulama",
                    sign_otp: {
                      draftUuid: payload.draft_uuid,
                      phoneMasked: payload.phone_masked ?? "Kayıtlı numara",
                    },
                  }
                : null,
            },
            { headers: corsHeaders },
          );
        } catch (err) {
          const msg =
            err instanceof Error
              ? err.message
              : "SMS doğrulaması başlatılamadı.";
          const failText = `İmzalama adımı başlatılamadı: ${msg}`;
          await supabase.from("messages").insert({
            conversation_id: cid,
            role: "assistant",
            content: failText,
          });
          return Response.json(
            { message: failText, conversationId: cid, action: null },
            { headers: corsHeaders },
          );
        }
      }
    }

    // Load conversation history (last 20 messages for context)
    const { data: history } = await supabase
      .from("messages")
      .select("role, content")
      .eq("conversation_id", cid)
      .order("created_at", { ascending: true })
      .limit(20);

    const claudeMessages: Anthropic.MessageParam[] = (history ?? []).map(
      (m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }),
    );

    const stableUserMsg = typeof message === "string" ? message : "";

    const dynamicSystemPrompt = buildDynamicSystemPromptForAgent();

    const wantsNdjson =
      clientWantsNdjsonStream(req, body) &&
      typeof message === "string" &&
      message.trim().length > 0;

    async function runAgentFinalizeAndPersist(
      msgs: Anthropic.MessageParam[],
    ): Promise<{ finalAssistant: string; action: ChatAction | null }> {
      const acc = await runAnthropicToolLoop(
        msgs,
        username,
        stableUserMsg,
        cid,
        dynamicSystemPrompt,
        null,
      );
      const fin = await finalizeAgentAssistant({
        convId: cid,
        username,
        userMessage: stableUserMsg,
        assistantText: acc.assistantText,
        usedFinanceTool: acc.usedFinanceTool,
        usedToolNames: acc.usedToolNames,
        latestInvoiceActionPayload: acc.latestInvoiceActionPayload,
        lastListInvoicesInput: acc.lastListInvoicesInput,
        lastListInvoicesReceivedInput: acc.lastListInvoicesReceivedInput,
      });
      await supabase.from("messages").insert({
        conversation_id: cid,
        role: "assistant",
        content: fin.finalAssistant,
        action_snapshot: persistableAction(fin.action),
      });
      return fin;
    }

    if (!wantsNdjson) {
      const fin = await runAgentFinalizeAndPersist(claudeMessages);
      return Response.json(
        {
          message: fin.finalAssistant,
          conversationId: cid,
          action: fin.action,
        },
        { headers: corsHeaders },
      );
    }

    const { readable, writable } = new TransformStream<
      Uint8Array,
      Uint8Array
    >();
    const ndWriter = writable.getWriter();

    void (async () => {
      try {
        await ndWriter.write(
          encodeNdjsonEvent({ type: "meta", conversationId: cid }),
        );

        const msgs = [...claudeMessages];
        const acc = await runAnthropicToolLoop(
          msgs,
          username,
          stableUserMsg,
          cid,
          dynamicSystemPrompt,
          ndWriter,
        );

        const fin = await finalizeAgentAssistant({
          convId: cid,
          username,
          userMessage: stableUserMsg,
          assistantText: acc.assistantText,
          usedFinanceTool: acc.usedFinanceTool,
          usedToolNames: acc.usedToolNames,
          latestInvoiceActionPayload: acc.latestInvoiceActionPayload,
          lastListInvoicesInput: acc.lastListInvoicesInput,
          lastListInvoicesReceivedInput: acc.lastListInvoicesReceivedInput,
        });

        await supabase.from("messages").insert({
          conversation_id: cid,
          role: "assistant",
          content: fin.finalAssistant,
          action_snapshot: persistableAction(fin.action),
        });

        await ndWriter.write(
          encodeNdjsonEvent({
            type: "done",
            message: fin.finalAssistant,
            conversationId: cid,
            action: fin.action,
          }),
        );
      } catch (e) {
        console.error("chat ndjson stream failed", e);
        const msg =
          e instanceof Error ? e.message : "Beklenmeyen bir hata oluştu.";
        try {
          await ndWriter.write(
            encodeNdjsonEvent({ type: "error", message: msg }),
          );
        } catch {
          /* client disconnected */
        }
      } finally {
        try {
          await ndWriter.close();
        } catch {
          /* */
        }
      }
    })();

    return new Response(readable, {
      headers: {
        ...corsHeaders,
        "Content-Type": NDJSON_CONTENT_TYPE,
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    if (err instanceof SessionAuthError) {
      return Response.json(
        { error: err.message },
        { status: err.status, headers: corsHeaders },
      );
    }
    console.error(err);
    const message =
      err instanceof Error ? err.message : "Beklenmeyen bir hata oluştu.";
    return Response.json({ error: message }, { headers: corsHeaders });
  }
});
