import { parseAmount } from "../_shared/amount-parse.ts";
import { normalizeTurkish } from "../_shared/turkish.ts";
import type { InvoiceSearchFilters } from "./types.ts";

/** Onay niyeti — fast-path dışında diğer intent'lerin tetiklenmesini engeller. */
export function isConfirmLikeMessage(message: string): boolean {
  const normalized = normalizeTurkish(message.trim());
  return (
    /\bonayliyorum\b/.test(normalized) ||
    /\bevet\s+onay\b/.test(normalized) ||
    /^(evet|onayla|onayliyorum)[.!]?$/.test(normalized)
  );
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "***";
  return `*** *** ** ${digits.slice(-2)}`;
}

export function wantsInvoicePreviewOrDownload(message: string): boolean {
  const msgNorm = normalizeTurkish(message);
  if (/\bexcel\b/.test(msgNorm) || /\bxlsx\b/.test(msgNorm)) return false;
  return (
    /\bfatura(yi)?\s*(gor|goster|goruntule|ac)\b/i.test(msgNorm) ||
    /\b(taslak|taslagi|onizle|pdf|goster|goruntule|gormek|gor|tam\s*fatura|paylas)\b/i
      .test(msgNorm) ||
    /\b(pdf\s+indir|faturayi?\s+indir|indir.*\bpdf\b|\bpdf\b.*\bindir)\b/i.test(msgNorm)
  );
}

/** Excel / dışa aktarma niyeti — fatura PDF önizlemesinden ayrı tutulur. */
export function isExcelExportIntent(message: string): boolean {
  const lower = normalizeTurkish(message);
  if (
    /\bexcel\b/.test(lower) ||
    /\bxlsx\b/.test(lower) ||
    /\bcsv\b/.test(lower) ||
    /\bdisari\s+aktar\b/.test(lower) ||
    /\bdışa\s+aktar\b/.test(message.toLocaleLowerCase("tr-TR"))
  ) {
    return true;
  }
  if (/\bindir\b/.test(lower) && /\bexcel\b/.test(lower)) return true;
  if (/\bexcel\b/.test(lower) && /\b(fatura|aktar|indir|yukle|çıktı|cikti)\b/.test(lower)) {
    return true;
  }
  if (
    /\brapor\s+(olustur|hazirla|indir|getir|ver|yap|cikar)\b/.test(lower) ||
    (/\b(bir\s+)?rapor\b/.test(lower) &&
      /\b(olustur|hazirla|indir|getir|ver|yap|cikar)\b/.test(lower))
  ) {
    return true;
  }
  return false;
}

/** Mevcut taslağı gösterme niyeti (yeni taslak oluşturma / onay değil). */
export function isDraftPreviewIntent(message: string): boolean {
  if (!wantsInvoicePreviewOrDownload(message)) return false;
  const msgNorm = normalizeTurkish(message);
  return !/\b(onayliyorum|onay|kes|olustur|yeni\s*fatura|yeniden)\b/.test(
    msgNorm,
  );
}

/** Tek faturayı göster/önizle (liste değil): "faturayı göster", "pdf aç" vb. */
export function isBareInvoiceShowIntent(message: string): boolean {
  if (isExcelExportIntent(message)) return false;
  if (!wantsInvoicePreviewOrDownload(message)) return false;
  const lower = normalizeTurkish(message);
  if (isLatestInvoiceIntent(message)) return false;
  if (/\b(faturalarim|faturalari|faturalarin|faturalar)\b/.test(lower)) {
    return false;
  }
  if (/\blistele\b/.test(lower)) return false;
  if (/\bhangi\b/.test(lower) && /\bfatura/.test(lower)) return false;
  if (/\b(kac|say)\b/.test(lower) && /\bfatura/.test(lower)) return false;
  return true;
}

export function shouldOfferInvoicesAction(
  userMessage: string,
  usedTools: Set<string>,
): boolean {
  if (isExcelExportIntent(userMessage)) return false;
  if (isLatestInvoiceIntent(userMessage)) return false;
  if (isBareInvoiceShowIntent(userMessage)) return false;
  if (isFinancialTotalsIntent(userMessage)) return false;
  if (usedTools.has("list_invoices")) {
    return true;
  }
  return isInvoiceListIntent(userMessage) || isIncomingInvoiceListIntent(userMessage);
}

function hasIncomingListSignals(lower: string): boolean {
  if (!/\bfatura/.test(lower)) return false;
  return (
    /\bgelen\s+fatura/.test(lower) ||
    /\bbana\s+kesilen?\s+fatura/.test(lower) ||
    /\btedarikci/.test(lower) ||
    /\balis\s+fatura/.test(lower) ||
    (/\bgelen\b/.test(lower) && /\b(getir|goster|listele)\b/.test(lower))
  );
}

/** Yorum/analiz isteyen soru — fast-path değil, Claude araçlarla yanıtlamalı. */
export function isAnalysisQuestion(message: string): boolean {
  const lower = normalizeTurkish(message);
  return /\b(yorum\w*|degerlendir\w*|analiz\w*|sence|tavsiye\w*|mali\s+durum\w*)\b/
    .test(lower);
}

function hasFinancialTotalsSignals(lower: string): boolean {
  if (/\b(fatura\s+list|faturalarim|listele)\b/.test(lower)) return false;
  // Vergi/beyanname sorusu ciro toplamı sorusu değildir ("gelir vergisi" ≠ gelir).
  if (
    /\b(vergi\w*|muhtasar\w*|stopaj\w*|beyanname\w*|tevkifat\w*|mahsup\w*|devreden\w*)\b/
      .test(lower)
  ) {
    return false;
  }
  return (
    /\b(gider\w*|borc\w*|harcama\w*|kazanc\w*|gelir\w*|kar\w*|ozet\w*)\b/.test(
      lower,
    ) ||
    (/\baylik\b/.test(lower) &&
      /\b(gider\w*|borc\w*|harcama\w*|kazanc\w*|gelir\w*)\b/.test(lower)) ||
    /\bne\s+kadar\s+(kazand\w*|harcad\w*|borc\w*)\b/.test(lower) ||
    /\b(gider\s*ve\s*gelir|gelir\s*ve\s*gider)\b/.test(lower)
  );
}

/** Gelen fatura listeleme niyeti. */
export function isIncomingInvoiceListIntent(userMessage: string): boolean {
  if (isAnalysisQuestion(userMessage)) return false;
  if (isLatestInvoiceIntent(userMessage)) return false;
  if (isBareInvoiceShowIntent(userMessage)) return false;

  const lower = normalizeTurkish(userMessage);
  if (hasFinancialTotalsSignals(lower)) return false;
  return hasIncomingListSignals(lower);
}

/** Gider/gelir/borç/kazanç toplamı niyeti ("fatura" kelimesi şart değil). */
export function isFinancialTotalsIntent(userMessage: string): boolean {
  if (isAnalysisQuestion(userMessage)) return false;
  const lower = normalizeTurkish(userMessage);
  if (hasIncomingListSignals(lower)) return false;
  if (isLatestInvoiceIntent(userMessage)) return false;
  return hasFinancialTotalsSignals(lower);
}

export function parseFinancialDirection(
  message: string,
): "incoming" | "outgoing" | "both" {
  const lower = normalizeTurkish(message);
  if (
    /\b(ozet|kar\s*zarar|gider\s*ve\s*gelir|gelir\s*ve\s*gider)\b/.test(lower)
  ) {
    return "both";
  }
  const incoming =
    /\b(gider\w*|borc\w*|harcama\w*|alis\w*)\b/.test(lower) ||
    /\bne\s+kadar\s+borc\w*\b/.test(lower);
  const outgoing =
    /\b(kazanc\w*|gelir\w*|satis\w*|kestig\w*|kar\w*)\b/.test(lower) ||
    /\bne\s+kadar\s+kazand\w*\b/.test(lower);
  if (incoming && !outgoing) return "incoming";
  if (outgoing && !incoming) return "outgoing";
  return "both";
}

/** Liste aracı yönü — belirtilmediyse her iki yön. */
export function parseInvoiceListDirection(
  input: Record<string, unknown>,
  userMessage: string,
): "outgoing" | "incoming" | "both" {
  if (input.direction === "incoming") return "incoming";
  if (input.direction === "outgoing") return "outgoing";
  if (input.direction === "both") return "both";
  const fromMsg = parseInvoiceDirectionFromMessage(userMessage);
  return fromMsg ?? "both";
}

/** Mesajdan fatura yönü çıkarımı (list/latest için). */
export function parseInvoiceDirectionFromMessage(
  message: string,
): "outgoing" | "incoming" | null {
  const lower = normalizeTurkish(message);
  if (
    /\bgelen\b/.test(lower) ||
    /\bbana\s+kesil/.test(lower) ||
    /\btedarikci/.test(lower) ||
    /\balis\s+fatura/.test(lower)
  ) {
    return "incoming";
  }
  if (
    /\b(kestigim|giden|sattigim|satis)\b/.test(lower) &&
    /\bfatura/.test(lower)
  ) {
    return "outgoing";
  }
  return null;
}

/** Tek fatura: "son fatura", "Ege beye son kestiğimiz fatura", "X'ten gelen son fatura" vb. */
export function isLatestInvoiceIntent(userMessage: string): boolean {
  const lower = normalizeTurkish(userMessage);
  if (!/\bfatura/.test(lower) && !/\bgelen\b/.test(lower)) return false;

  const pluralList =
    /\b(faturalarim|faturalari|faturalarin|faturalar)\b/.test(lower);
  const incomingLatest =
    /\b(gelen|bana\s+kesilen?)\b/.test(lower) &&
    (/\b(en\s+son|son)\b/.test(lower) || /\bson\s+gelen\b/.test(lower));
  const singularLatest =
    incomingLatest ||
    /\b(en\s+son|son)\s+faturayi?\b/.test(lower) ||
    /\b(en\s+son|son)\s+kest\w*\s+faturayi?\b/.test(lower) ||
    (/\bson\b/.test(lower) && /\bfaturayi?\s*(getir|goster|bul)\b/.test(lower));

  if (pluralList && !singularLatest) return false;

  if (
    /\b(olustur|taslak|onayla|iptal)\b/.test(lower) &&
    !singularLatest
  ) {
    return false;
  }

  return singularLatest;
}

/** Kestiğin veya gelen faturaları listeleme / getirme niyeti. */
export function isInvoiceListIntent(userMessage: string): boolean {
  if (isAnalysisQuestion(userMessage)) return false;
  if (isLatestInvoiceIntent(userMessage)) return false;
  if (isBareInvoiceShowIntent(userMessage)) return false;
  if (isIncomingInvoiceListIntent(userMessage)) return false;
  if (isFinancialTotalsIntent(userMessage)) return false;

  const lower = normalizeTurkish(userMessage);
  if (!lower.includes("fatura") && !lower.includes("faturalari")) {
    return false;
  }
  if (
    /\b(kes|olustur|taslak|onayla|iptal|gonder)\b/.test(lower) &&
    !/\b(getir|goster|listele)\b/.test(lower)
  ) {
    return false;
  }
  const plural =
    lower.includes("faturalarim") || lower.includes("faturalari");
  return (
    lower.includes("listele") ||
    (/\b(getir|goster)\b/.test(lower) && /\bfatura/.test(lower)) ||
    (lower.includes("hangi") && lower.includes("fatura")) ||
    lower.includes("neler") ||
    (/\b(kac|say)\b/.test(lower) && lower.includes("fatura")) ||
    plural ||
    ((lower.includes("getir") || lower.includes("goster")) && plural)
  );
}

/** Belirsiz müşteri sorusuna kısa tam ad yanıtı: "Ege Durmaz" */
const CLARIFICATION_COMMAND_WORDS =
  /\b(tamam|tamamd|hayir|anladim|peki|kabul|olur|oldu|tesekkur|tesekkurler|merhaba|sagol|evet|tabii|super|guzel|okay|ok|hm+|hmm|yok|iptal|evet\s+olur)\b/;

export function isCustomerClarificationIntent(message: string): boolean {
  const t = message.trim();
  if (t.length < 5 || t.length > 80) return false;
  const norm = normalizeTurkish(t);
  if (/\bfatura/.test(norm)) return false;
  if (/\brapor\b/.test(norm)) return false;
  if (
    /\b(olustur|hazirla|indir|aktar|cikar)\b/.test(norm) &&
    !/\bfatura\b/.test(norm)
  ) {
    return false;
  }
  if (CLARIFICATION_COMMAND_WORDS.test(norm)) return false;
  if (!/^[A-Za-zÇĞİÖŞÜçğıöşü]+(?:\s+[A-Za-zÇĞİÖŞÜçğıöşü]+){1,3}$/.test(t)) {
    return false;
  }
  return isLikelyInvoiceCustomerName(t);
}

export function isUserProfileIntent(userMessage: string): boolean {
  const lower = userMessage.toLocaleLowerCase("tr-TR");
  return (
    lower.includes("profilim") ||
    lower.includes("firma bilgilerim") ||
    lower.includes("kullanıcı bilgilerim") ||
    lower.includes("kullanici bilgilerim") ||
    lower.includes("bilgilerimi getir")
  );
}

export function summarizeUserProfile(profile: {
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

const INVOICE_CUSTOMER_FILTER_STOPWORDS = new Set([
  "bir",
  "bu",
  "gecen",
  "son",
  "ay",
  "ayki",
  "aylik",
  "onceki",
  "yil",
  "yili",
  "gelen",
  "giden",
  "fatura",
  "faturalari",
  "faturalarim",
  "listele",
  "getir",
  "goster",
  "gor",
  "hazirla",
  "olustur",
  "rapor",
  "raporu",
]);

/** "Bu ayki", "Geçen ayki" gibi tarih ifadelerini müşteri adı sayma. */
export function isLikelyInvoiceCustomerName(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length < 3) return false;
  const norm = normalizeTurkish(trimmed).replace(/\s+/g, " ");
  if (
    /^(bu|gecen|son|onceki)(\s+(ay(ki)?|yil(ki)?))?$/.test(norm) ||
    /^(bu ayki|gecen ayki|son ayki|bu ay|gecen ay|bu yil|gecen yil)$/.test(norm)
  ) {
    return false;
  }
  const words = norm.split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;
  const meaningful = words.filter(
    (w) => !INVOICE_CUSTOMER_FILTER_STOPWORDS.has(w) && w.length >= 3,
  );
  return meaningful.length > 0;
}

export function sanitizeInvoiceSearchFilters(
  filters: InvoiceSearchFilters,
): InvoiceSearchFilters {
  const out = { ...filters };
  if (out.customerName && !isLikelyInvoiceCustomerName(out.customerName)) {
    delete out.customerName;
  }
  return out;
}

export function parseFiltersFromText(text: string): InvoiceSearchFilters {
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

  const fromVendor = text.match(
    /([A-Za-zÇĞİÖŞÜçğıöşü][A-Za-zÇĞİÖŞÜçğıöşü\s.'-]{1,40}?)\s*(?:firmasindan|firmasından|den|dan|'ten|'tan)\s+gelen/i,
  );
  if (fromVendor?.[1]) {
    const candidate = fromVendor[1].trim().replace(/\s+/g, " ");
    if (isLikelyInvoiceCustomerName(candidate)) {
      filters.customerName = candidate;
    }
  }

  const beyeKesti = text.match(
    /\b([A-Za-zÇĞİÖŞÜçğıöşü]+)\s+bey[e]?\s+kesti/i,
  );
  const customerMatch =
    beyeKesti ??
    text.match(
      /([A-Za-zÇĞİÖŞÜçğıöşü\s]+?)\s+(beye|bey|hanıma|hanima|hanim|bayan)\b/i,
    ) ??
    text.match(/([A-Za-zÇĞİÖŞÜçğıöşü\s]+?)['']?(?:ya|ye)\s+kesti/i) ??
    text.match(/([A-Za-zÇĞİÖŞÜçğıöşü\s]+?)\s+(?:adına|adina)/i);

  if (beyeKesti?.[1]) {
    const candidate = beyeKesti[1].trim();
    if (isLikelyInvoiceCustomerName(candidate)) {
      filters.customerName = candidate;
    }
  } else if (!filters.customerName && customerMatch?.[1]) {
    const raw = customerMatch[1].trim().replace(/\s+/g, " ");
    const cleaned = raw.split(" ").slice(-2).join(" ");
    if (cleaned.length >= 2 && isLikelyInvoiceCustomerName(cleaned)) {
      filters.customerName = cleaned;
    }
  }

  const fullNameInFatura = text.match(
    /\b([A-Za-zÇĞİÖŞÜçğıöşü]{2,}\s+[A-Za-zÇĞİÖŞÜçğıöşü]{2,})\b.*\bfatura/i,
  );
  if (fullNameInFatura?.[1] && !filters.customerName) {
    const candidate = fullNameInFatura[1].trim();
    if (isLikelyInvoiceCustomerName(candidate)) {
      filters.customerName = candidate;
    }
  }

  return filters;
}
