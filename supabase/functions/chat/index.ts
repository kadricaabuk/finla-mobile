import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import {
  extractGibUserDataStringPatch,
  faturaCancelInvoice,
  faturaConfirmInvoiceIssue,
  faturaCreateInvoicePreview,
  faturaGetInvoiceHtml,
  gibGetInvoicePreview,
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
import { createInvoicesExcelExport } from "../_shared/invoices-excel-export.ts";
import {
  fetchTcmbExchangeRate,
  isForeignInvoiceCurrency,
  type SupportedExchangeCurrency,
} from "../_shared/exchange-rate.ts";
import {
  buildLocalDraftPreviewHtml,
  normalizeCurrencyRate,
  summarizeGibInvoicePayload,
  type CreateInvoiceInput,
} from "../_shared/invoice-mapper.ts";
import {
  featureFlags,
  loadFeatureFlags,
  type FinlaFeatures,
} from "../_shared/feature-config.ts";
import {
  allowedToolNames,
  filterToolsWithEphemeralPromptCacheLast,
} from "../_shared/feature-tools.ts";
import {
  getSubjectFromAuthHeader,
  SessionAuthError,
} from "../_shared/session-auth.ts";
import { assembleSystemPrompt, TOOLS } from "../_shared/tools.ts";
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

function getActiveFeatures(): FinlaFeatures {
  return featureFlags();
}

function anthropicToolsForChat(): Anthropic.Tool[] {
  return filterToolsWithEphemeralPromptCacheLast(
    TOOLS,
    allowedToolNames(getActiveFeatures()),
  );
}

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

  // "son 1 ay", "son bir ay"
  if (
    /son\s+(?:bir\s+)?1\s+ay\b/.test(lower.replace(/\s+/g, " ")) ||
    lower.includes("son bir ay") ||
    lower.includes("son 1 aylık") ||
    lower.includes("son bir aylık")
  ) {
    const end = today;
    const start = new Date(today);
    start.setUTCMonth(start.getUTCMonth() - 1);
    return { startDate: formatTrDate(start), endDate: formatTrDate(end) };
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
  const f = getActiveFeatures();
  if (!f.outgoingInvoices && !f.incomingInvoices) return false;
  if (
    f.outgoingInvoices && usedTools.has("list_invoices")
  ) {
    return true;
  }
  if (
    f.incomingInvoices && usedTools.has("list_invoices_received")
  ) {
    return true;
  }
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
    (toolName === "create_invoice" || toolName === "get_exchange_rate") &&
    lower.includes("tcmb kur")
  ) {
    return {
      code: "EXCHANGE_RATE_UNAVAILABLE",
      message:
        "TCMB kur bilgisine şu an ulaşılamadı. Biraz sonra tekrar dene veya kur oranını manuel gir.",
    };
  }
  if (
    toolName === "create_invoice" &&
    (lower.includes("exchange_rate") ||
      lower.includes("kur oranı") ||
      lower.includes("kur orani") ||
      lower.includes("dövizli fatura") ||
      lower.includes("dovizli fatura"))
  ) {
    return {
      code: "MISSING_EXCHANGE_RATE",
      message:
        "Dövizli fatura için kur oranı gerekli. 1 birim dövizin TL karşılığını sor (ör. USD için 40.50).",
    };
  }
  if (
    toolName === "create_invoice" &&
    (lower.includes("önizleme html") || lower.includes("html alınamadı"))
  ) {
    return {
      code: "PREVIEW_HTML_UNAVAILABLE",
      message:
        "Fatura taslağı oluşturuldu ancak önizleme HTML'i şu an alınamadı. Taslak GİB'de mevcut; onay akışına devam edilebilir.",
    };
  }
  if (
    toolName === "create_invoice" &&
    (lower.includes("string index out of range") ||
      lower.includes("index out of range"))
  ) {
    return {
      code: "INVALID_INVOICE_DATA",
      message:
        "Fatura verisi GİB tarafından işlenemedi. Birim kodu, kur oranı veya alıcı bilgilerini kontrol et.",
    };
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

const TOOL_LOG_MAX_STRING = 2_000;
const TOOL_LOG_MAX_ARRAY = 20;
const TOOL_LOG_MAX_DEPTH = 6;

type ToolCallLogMeta = {
  source?: "agent" | "fast_path";
  tool_use_id?: string;
  agent_round?: number;
  ndjsonWriter?: WritableStreamDefaultWriter<Uint8Array> | null;
};

function sanitizeForToolLog(value: unknown, depth = 0): unknown {
  if (depth > TOOL_LOG_MAX_DEPTH) return "[max_depth]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    if (value.length <= TOOL_LOG_MAX_STRING) return value;
    return `${value.slice(0, TOOL_LOG_MAX_STRING)}…[+${value.length - TOOL_LOG_MAX_STRING} chars]`;
  }
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    const sliced = value
      .slice(0, TOOL_LOG_MAX_ARRAY)
      .map((item) => sanitizeForToolLog(item, depth + 1));
    if (value.length > TOOL_LOG_MAX_ARRAY) {
      sliced.push(`…[+${value.length - TOOL_LOG_MAX_ARRAY} items]`);
    }
    return sliced;
  }
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (/password|sms_code|token|cred|secret|refresh/i.test(key)) {
      out[key] = "[redacted]";
      continue;
    }
    if (key === "code" && typeof raw === "string") {
      out[key] = "[redacted]";
      continue;
    }
    if (
      (key === "preview_html" || key === "html") &&
      typeof raw === "string"
    ) {
      out[key] = `[html ${raw.length} chars]`;
      continue;
    }
    out[key] = sanitizeForToolLog(raw, depth + 1);
  }
  return out;
}

async function logToolCallJson(
  payload: Record<string, unknown>,
  ndjsonWriter?: WritableStreamDefaultWriter<Uint8Array> | null,
): Promise<void> {
  const ts = new Date().toISOString();
  console.log(
    JSON.stringify({
      ts,
      event: "tool_call",
      ...payload,
    }),
  );
  if (!ndjsonWriter) return;
  const phase = payload.phase;
  if (phase !== "start" && phase !== "success" && phase !== "error") return;
  const tool = payload.tool;
  const conversation_id = payload.conversation_id;
  const gib_username = payload.gib_username;
  if (
    typeof tool !== "string" ||
    typeof conversation_id !== "string" ||
    typeof gib_username !== "string"
  ) {
    return;
  }
  await ndjsonWriter.write(
    encodeNdjsonEvent({
      type: "tool_log",
      ts,
      phase,
      tool,
      conversation_id,
      gib_username,
      ...(typeof payload.source === "string"
        ? { source: payload.source as "agent" | "fast_path" }
        : {}),
      ...(typeof payload.tool_use_id === "string"
        ? { tool_use_id: payload.tool_use_id }
        : {}),
      ...(typeof payload.agent_round === "number"
        ? { agent_round: payload.agent_round }
        : {}),
      ...(payload.input !== undefined ? { input: payload.input } : {}),
      ...(payload.output !== undefined ? { output: payload.output } : {}),
      ...(typeof payload.user_message_preview === "string"
        ? { user_message_preview: payload.user_message_preview }
        : {}),
      ...(typeof payload.duration_ms === "number"
        ? { duration_ms: payload.duration_ms }
        : {}),
      ...(typeof payload.error_message === "string"
        ? { error_message: payload.error_message }
        : {}),
      ...(typeof payload.error_code === "string"
        ? { error_code: payload.error_code }
        : {}),
      ...(typeof payload.error_classified_message === "string"
        ? { error_classified_message: payload.error_classified_message }
        : {}),
      ...(payload.gib_payload_debug !== undefined
        ? { gib_payload_debug: payload.gib_payload_debug }
        : {}),
    }),
  );
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
        draftDate: action.preview?.draftDate,
        issued:
          typeof action.preview?.issued === "boolean"
            ? action.preview.issued
            : false,
      },
    };
  }
  if (action.type === "open_excel_export") {
    return {
      type: action.type,
      label: action.label,
      excel_export: {
        file_name: action.excel_export?.file_name ?? "finla-export.xlsx",
        row_count: typeof action.excel_export?.row_count === "number"
          ? action.excel_export.row_count
          : 0,
      },
    };
  }
  try {
    return JSON.parse(JSON.stringify(action)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function wantsInvoicePreviewOrDownload(message: string): boolean {
  const msgNorm = normalizeTurkish(message);
  return (
    /\bfatura(yi)?\s*(gor|goster|goruntule|ac)\b/i.test(msgNorm) ||
    /\b(taslak|taslagi|onizle|pdf|indir|goster|goruntule|gormek|gor|tam\s*fatura|paylas)\b/i
      .test(msgNorm)
  );
}

/** Mevcut taslağı gösterme niyeti (yeni taslak oluşturma / onay değil). */
function isDraftPreviewIntent(message: string): boolean {
  if (!wantsInvoicePreviewOrDownload(message)) return false;
  const msgNorm = normalizeTurkish(message);
  return !/\b(onayliyorum|onay|kes|olustur|yeni\s*fatura|yeniden)\b/.test(msgNorm);
}

async function buildPendingDraftPreviewAction(
  username: string,
  pending: PendingInvoiceState,
): Promise<ChatAction | null> {
  const uuid = pending.draft?.uuid;
  const draftDate = pending.draft?.date;
  if (!uuid) return null;

  let html =
    typeof pending.preview_html === "string" ? pending.preview_html : "";
  let pdfBase64: string | undefined;

  if (!html.length) {
    try {
      const preview = await gibGetInvoicePreview(
        username,
        uuid,
        false,
        draftDate,
      );
      html = preview.html ?? "";
      pdfBase64 = preview.pdfBase64;
    } catch (err) {
      console.error("buildPendingDraftPreviewAction preview failed", err);
    }
  }

  if (!html.length && !pdfBase64 && pending.request) {
    html = buildLocalDraftPreviewHtml(pending.request);
  }

  return {
    type: "open_invoice_preview",
    label: "Taslağı Gör",
    preview: {
      title: "Taslak Fatura Önizleme",
      ...(html.length > 0 ? { html } : {}),
      ...(pdfBase64 ? { pdfBase64 } : {}),
      uuid,
      ...(draftDate ? { draftDate } : {}),
      issued: false,
    },
  };
}

function assistantFallbackForAction(action: ChatAction | null): string {
  if (!action) return "";
  switch (action.type) {
    case "open_invoice_preview":
      return "Taslak hazır — önizlemeyi kontrol edebilirsin. Uygunsa onaylayıp imzalamaya geçebilirsin.";
    case "open_invoices":
      return "Fatura listesi hazır — alttaki düğmeyle ekranı açabilirsin.";
    case "open_invoice_detail":
      return "Seçilen fatura için detay düğmesine dokunabilirsin.";
    case "open_excel_export":
      return "Excel dosyan hazır — alttaki düğmeyle indirip paylaşabilirsin.";
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

async function executeToolImpl(
  toolName: string,
  input: Record<string, unknown>,
  username: string,
  userMessage: string,
  conversationId: string,
): Promise<unknown> {
  const active = getActiveFeatures();
  const allowedNames = allowedToolNames(active);
  if (!allowedNames.has(toolName)) {
    throw new Error("Bu özellik şu anda uygulamada kapalı.");
  }

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
      const { data: convPending } = await supabase
        .from("conversations")
        .select("pending_invoice")
        .eq("id", conversationId)
        .single();
      const existingPending =
        convPending?.pending_invoice as PendingInvoiceState | null;
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
        await supabase
          .from("conversations")
          .update({
            pending_invoice: {
              status: "exchange_rate_pending",
              exchange_rate_quote: {
                currency: quote.currency,
                rate: quote.rate,
                rate_date: quote.rateDate,
                source: quote.source,
                rate_type: quote.rateType,
              },
              request: input,
            },
          })
          .eq("id", conversationId);

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

      await supabase
        .from("conversations")
        .update({
          pending_invoice: {
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
          },
        })
        .eq("id", conversationId);

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

    case "export_invoices_excel": {
      const range = resolveDateRange(input, userMessage, "month");
      if (!range) throw new Error("Tarih aralığı belirlenemedi.");
      let direction: "outgoing" | "incoming" = "outgoing";
      if (input.direction === "incoming") {
        direction = "incoming";
      } else if (input.direction !== "outgoing") {
        const n = normalizeTurkish(userMessage);
        if (
          /\bgelen\b/.test(n) ||
          /\bbana\s+kesilen\b/.test(n)
        ) {
          direction = "incoming";
        }
      }
      if (direction === "outgoing" && !active.outgoingInvoices) {
        throw new Error("Giden fatura dışa aktarma kapalı.");
      }
      if (direction === "incoming" && !active.incomingInvoices) {
        throw new Error("Gelen fatura dışa aktarma kapalı.");
      }
      return await createInvoicesExcelExport({
        supabase,
        username,
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
      return faturaCancelInvoice(
        username,
        input.ettn as string,
        (input.reason as string) || "İptal",
      );

    default:
      throw new Error(`Bilinmeyen araç: ${toolName}`);
  }
}

function createInvoiceInputFromToolInput(
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

async function executeTool(
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

const MAX_AGENT_ROUNDS = 28;

function assembleResponseContractAgent(f: FinlaFeatures): string {
  const lines: string[] = [
    `Yanit stili:`,
    `- Konusma dili kullan; rapor/excel dili kullanma.`,
    `- Zorunlu sabit basliklar ("Istek", "Sonuc", "Tarih Araligi", "Sonraki Adim") kullanma.`,
    `- Gerekirse tarihi cumle icinde dogalca belirt.`,
    `- Tutar/KDV gibi sayisal degerleri sadece arac sonucundan kullan; tahmin etme.`,
    `- Markdown tablo kullanma; gerekiyorsa kisa madde listesi kullan.`,
    `- Kullanici "bu ay", "ayin basindan beri", "dun", "gecen hafta" derse tarih sormadan ilgili araci cagir.`,
    `- Cevabi kisa tut (genelde 2-5 cumle).`,
    ``,
    `Fatura arama/filtreleme:`,
  ];
  if (f.outgoingInvoices) {
    lines.push(
      `- Fatura kesim akisi: (1) create_invoice ile taslak olustur, (2) kullanici onizlemeyi gorur, (3) onay + SMS imza.`,
    );
    lines.push(
      `- Taslak zaten varsa (preview_ready) create_invoice TEKRAR CAGIRMA; kullaniciya mevcut taslagi onizle.`,
    );
    lines.push(
      `- Kullanici "taslagi gor", "onizle", "pdf" derse yeni taslak olusturma; mevcut pending taslak varsa onu ac.`,
    );
    lines.push(
      `- list_invoices aracindan bos sonuc gelirse, kullanilan tarih ve filtre kriterlerini kullaniciya bildir (ornek: "Ahmet icin bu ay fatura bulunamadi").`,
    );
  }
  if (f.incomingInvoices) {
    lines.push(
      `- list_invoices_received (gelen) icin de bos sonucta tarih ve filtreleri belirt; kesilen faturalarla karistirma.`,
    );
  }
  if (f.outgoingInvoices || f.incomingInvoices) {
    lines.push(
      `- Kullanici excel, csv, xlsx veya "disari aktar" isterse export_invoices_excel aracini cagir; gelen/kesilen ayrimi icin direction kullan.`,
    );
    lines.push(
      `- Fatura listesi getirince kullanilan tarih araligini ve varsa filtreler dogal sekilde belirt.`,
    );
  }
  if (f.profile) {
    lines.push(
      `- Kullanici "profilim", "firma bilgilerim", "kullanici bilgilerim", "bilgilerimi getir" derse mutlaka get_user_profile aracini cagir.`,
    );
  }
  lines.push(
    ``,
    `Hata yonetimi (arac sonucunda "error_code" varsa):`,
    `- INVALID_TAX_ID: "Bu VKN/TCKN gecersiz gorunuyor, numarayi kontrol eder misin?" diye sor.`,
    `- INVALID_DATE: "Tarih formati yanlis — GG/AA/YYYY formatinda girer misin?" de.`,
    `- MISSING_EXCHANGE_RATE: USD/EUR fatura icin get_exchange_rate ile TCMB kurunu goster veya kullanicidan kur iste.`,
    `- EXCHANGE_RATE_CONFIRMATION: create_invoice "exchange_rate_confirmation" dondururse TCMB kurunu ozetle ve onay iste; onaydan sonra ayni parametrelerle exchange_rate gondererek create_invoice tekrar cagir.`,
    `- EXCHANGE_RATE_UNAVAILABLE: TCMB'ye ulasilamadi; biraz bekle veya manuel kur sor.`,
    `- INVALID_INVOICE_DATA: Birim, kur veya alici bilgisinde sorun olabilir; kullanicidan eksik bilgiyi netlestir.`,
    `- GIB_UNAVAILABLE: "GIB su an yanit vermiyor, biraz bekleyip tekrar deneyelim." de.`,
    `- SESSION_EXPIRED: "Oturumun sona ermis gibi gorunuyor, uygulamayi kapatip tekrar acmayi dene." de.`,
    `- GIB_ERROR veya diger: Hata mesajini dogal Turkce ile ozetle, kullanici ne yapmasi gerektigini acikla.`,
    `- Hata sonrasi ne yapilabilecegini mutlaka belirt; "tekrar deneyin" yerine somut adim oner.`,
  );

  return lines.join("\n");
}

function buildDynamicSystemPromptForAgent(): string {
  const f = getActiveFeatures();
  return `${assembleSystemPrompt(f)}

Bugunun tarihi: ${formatTrDate(istanbulTodayUtc())}
Saat dilimi: ${ISTANBUL_TZ}
${assembleResponseContractAgent(f)}`;
}

type AgentLoopAccumulator = {
  assistantText: string;
  usedFinanceTool: boolean;
  usedToolNames: Set<string>;
  latestInvoiceActionPayload: InvoiceDetailPayload | null;
  lastListInvoicesInput: Record<string, unknown> | null;
  lastListInvoicesReceivedInput: Record<string, unknown> | null;
  lastExportExcelPayload: {
    download_url: string;
    file_name: string;
    row_count: number;
    expires_in_seconds: number;
  } | null;
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
  let lastExportExcelPayload: AgentLoopAccumulator["lastExportExcelPayload"] =
    null;

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
      tools: anthropicToolsForChat(),
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
              {
                source: "agent",
                tool_use_id: block.id,
                agent_round: round,
                ndjsonWriter,
              },
            );
            if (
              block.name === "invoice_totals" ||
              block.name === "latest_invoice" ||
              block.name === "export_invoices_excel"
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
            if (block.name === "export_invoices_excel" && result !== null &&
              typeof result === "object"
            ) {
              const r = result as Record<string, unknown>;
              if (
                typeof r.download_url === "string" &&
                typeof r.file_name === "string"
              ) {
                lastExportExcelPayload = {
                  download_url: r.download_url,
                  file_name: r.file_name,
                  row_count:
                    typeof r.row_count === "number" &&
                      Number.isFinite(r.row_count)
                      ? r.row_count
                      : 0,
                  expires_in_seconds:
                    typeof r.expires_in_seconds === "number" &&
                      Number.isFinite(r.expires_in_seconds)
                      ? r.expires_in_seconds
                      : 300,
                };
              }
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
    lastExportExcelPayload,
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
  lastExportExcelPayload: AgentLoopAccumulator["lastExportExcelPayload"];
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
    lastExportExcelPayload,
  } = opts;
  const f = getActiveFeatures();

  let trimmedAssistant = assistantText;
  if (
    f.profile &&
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
  if (
    lastExportExcelPayload &&
    usedToolNames.has("export_invoices_excel")
  ) {
    action = {
      type: "open_excel_export",
      label: `Excel indir (${lastExportExcelPayload.row_count} fatura)`,
      excel_export: {
        download_url: lastExportExcelPayload.download_url,
        file_name: lastExportExcelPayload.file_name,
        row_count: lastExportExcelPayload.row_count,
        expires_in_seconds: lastExportExcelPayload.expires_in_seconds,
      },
    };
  }

  const wantsPreviewOrDownload = wantsInvoicePreviewOrDownload(
    String(userMessage ?? ""),
  );
  if (
    f.outgoingInvoices &&
    !action &&
    (wantsPreviewOrDownload || usedToolNames.has("create_invoice"))
  ) {
    if (pending?.draft?.uuid) {
      action = await buildPendingDraftPreviewAction(username, pending);
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
  } else if (
    f.outgoingInvoices &&
    !action &&
    latestInvSnap?.invoice_uuid
  ) {
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
  } else if (!action &&
    shouldOfferInvoicesAction(userMessage, usedToolNames)
  ) {
    const normMsg = normalizeTurkish(userMessage);
    const usedReceivedList =
      f.incomingInvoices &&
      usedToolNames.has("list_invoices_received");
    const usedOutgoingList =
      f.outgoingInvoices && usedToolNames.has("list_invoices");
    let incomingPreferred = usedReceivedList;
    if (usedOutgoingList) incomingPreferred = false;
    const msgSuggestsIncoming =
      /\bgelen\b/.test(normMsg) || /\bbana\s+kesilen\b/.test(normMsg);
    if (!usedOutgoingList && f.incomingInvoices && msgSuggestsIncoming) {
      incomingPreferred = true;
    }
    if (
      !usedOutgoingList &&
      !usedReceivedList
    ) {
      if (!f.outgoingInvoices && f.incomingInvoices) {
        incomingPreferred = true;
      } else if (f.outgoingInvoices && !f.incomingInvoices) {
        incomingPreferred = false;
      }
    }
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
    if (
      parsedRange &&
      !(incomingPreferred && !f.incomingInvoices) &&
      !(!incomingPreferred && !f.outgoingInvoices)
    ) {
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
    await loadFeatureFlags();
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
      /\b(onayliyorum|onaylıyorum)\b/.test(normalizedMessage) ||
      /\bevet\s+onay\b/.test(normalizedMessage);
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
            { source: "fast_path" },
          );
          const result = await executeTool(
            "confirm_invoice_issue",
            {},
            username,
            message ?? "",
            cid,
            { source: "fast_path" },
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

    const chatFeatures = getActiveFeatures();

    // Deterministic fast-path: pending taslak önizleme (yeni create_invoice çağırma)
    if (
      hasMessage &&
      chatFeatures.outgoingInvoices &&
      !isConfirmMessage &&
      !isConfirmAction &&
      !isRequestOtpAction &&
      !isVerifyOtpAction &&
      isDraftPreviewIntent(message ?? "")
    ) {
      const { data: convState, error: pendingErr } = await supabase
        .from("conversations")
        .select("pending_invoice")
        .eq("id", cid)
        .single();
      if (pendingErr) throw pendingErr;

      const pending = convState?.pending_invoice as PendingInvoiceState | null;
      if (pending?.draft?.uuid) {
        const previewAction = await buildPendingDraftPreviewAction(
          username,
          pending,
        );
        const directMessage = previewAction
          ? "Taslak faturanı önizlemede açtım. Kontrol et; uygunsa onayla ve imzalamaya geç."
          : "Taslak bulunamadı. Önce fatura bilgilerini verip taslak oluşturalım.";
        await supabase.from("messages").insert({
          conversation_id: cid,
          role: "assistant",
          content: directMessage,
        });
        return Response.json(
          {
            message: directMessage,
            conversationId: cid,
            action: previewAction,
          },
          { headers: corsHeaders },
        );
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
            { source: "fast_path" },
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
        lastExportExcelPayload: acc.lastExportExcelPayload,
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
          lastExportExcelPayload: acc.lastExportExcelPayload,
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
