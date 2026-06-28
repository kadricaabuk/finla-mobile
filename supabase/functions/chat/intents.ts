import { parseAmount } from "../_shared/invoice-facts.ts";
import { normalizeTurkish } from "../_shared/turkish.ts";
import type { InvoiceSearchFilters } from "./types.ts";

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "***";
  return `*** *** ** ${digits.slice(-2)}`;
}

export function wantsInvoicePreviewOrDownload(message: string): boolean {
  const msgNorm = normalizeTurkish(message);
  return (
    /\bfatura(yi)?\s*(gor|goster|goruntule|ac)\b/i.test(msgNorm) ||
    /\b(taslak|taslagi|onizle|pdf|indir|goster|goruntule|gormek|gor|tam\s*fatura|paylas)\b/i
      .test(msgNorm)
  );
}

/** Mevcut taslağı gösterme niyeti (yeni taslak oluşturma / onay değil). */
export function isDraftPreviewIntent(message: string): boolean {
  if (!wantsInvoicePreviewOrDownload(message)) return false;
  const msgNorm = normalizeTurkish(message);
  return !/\b(onayliyorum|onay|kes|olustur|yeni\s*fatura|yeniden)\b/.test(
    msgNorm,
  );
}

export function shouldOfferInvoicesAction(
  userMessage: string,
  usedTools: Set<string>,
): boolean {
  if (usedTools.has("list_invoices")) {
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
