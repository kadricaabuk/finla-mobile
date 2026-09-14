/**
 * Excel dışa aktarım için tevkifat / istisna alanlarını ham fatura
 * (invoice_facts.raw_payload) üzerinden çıkarır.
 *
 * Liste senkronu `mapMysoftHeaderToGibLike` sonrası `gross_total` olarak
 * ödenecek tutarı (payable) yazar; tevkifat ve istisna ayrı sütunlarda
 * tutulmadığı için export sırasında raw_payload'dan türetilir.
 */

function parseMaybeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // TR: 1.234,56 veya düz 1234.56 / 1234,56
  const normalized = trimmed.includes(",")
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : trimmed.replace(/,/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function pickStr(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Satır/header vergi dizilerinden ilk istisna kodunu bulur. */
function exemptionCodeFromTaxNodes(raw: Record<string, unknown>): string | null {
  const bags: unknown[] = [];
  if (Array.isArray(raw.tax)) bags.push(...raw.tax);
  if (Array.isArray(raw.taxSubTotal)) bags.push(...raw.taxSubTotal);
  if (Array.isArray(raw.invoiceDetail)) bags.push(...raw.invoiceDetail);

  for (const node of bags) {
    if (!node || typeof node !== "object") continue;
    const row = node as Record<string, unknown>;
    const direct = pickStr(
      row.taxExemptionReasonCode,
      row.vatExemptionCode,
      row.istisnaKodu,
    );
    if (direct) return direct;
    if (Array.isArray(row.taxSubTotal)) {
      for (const sub of row.taxSubTotal) {
        if (!sub || typeof sub !== "object") continue;
        const code = pickStr(
          (sub as Record<string, unknown>).taxExemptionReasonCode,
          (sub as Record<string, unknown>).vatExemptionCode,
        );
        if (code) return code;
      }
    }
  }
  return null;
}

export type InvoiceExportTaxFields = {
  /** Vergiler dahil (tevkifat öncesi) toplam. */
  taxInclusiveTotal: number | null;
  /** Fiilen ödenecek / tahsil edilecek tutar. */
  payableTotal: number | null;
  /** KDV tevkifat tutarı (alıcının 2 no.lu beyana konu kısmı). */
  withholdingTotal: number | null;
  /** GİB KDV istisna kodu (ör. 302); yoksa null. */
  exemptionCode: string | null;
};

/**
 * Ham Mysoft/GİB-benzeri satırdan Excel tevkifat/istisna sütunlarını üretir.
 */
export function extractExportTaxFields(
  raw: Record<string, unknown> | null | undefined,
): InvoiceExportTaxFields {
  if (!raw || typeof raw !== "object") {
    return {
      taxInclusiveTotal: null,
      payableTotal: null,
      withholdingTotal: null,
      exemptionCode: null,
    };
  }

  const payableTotal =
    parseMaybeNumber(raw.payableAmount) ??
    parseMaybeNumber(raw.odenecekTutar) ??
    null;

  const taxInclusiveTotal =
    parseMaybeNumber(raw.taxInclusiveAmount) ??
    parseMaybeNumber(raw.taxInclusive) ??
    // mapMysoftHeaderToGibLike `vergilerDahilToplamTutar`'ı payable ile
    // ezebildiği için yalnızca payable yoksa / farklıysa kullan.
    (payableTotal === null
      ? parseMaybeNumber(raw.vergilerDahilToplamTutar)
      : (() => {
          const labeled = parseMaybeNumber(raw.vergilerDahilToplamTutar);
          if (labeled === null) return null;
          if (Math.abs(labeled - payableTotal) < 0.005) return null;
          return labeled;
        })()) ??
    null;

  const explicitWithholding =
    parseMaybeNumber(raw.withholdingTaxAmount) ??
    parseMaybeNumber(raw.tevkifatTutari) ??
    parseMaybeNumber(raw.tevkifatToplami) ??
    parseMaybeNumber(raw.withholdingTotal) ??
    null;

  let withholdingTotal = explicitWithholding;
  if (
    withholdingTotal === null &&
    taxInclusiveTotal !== null &&
    payableTotal !== null
  ) {
    const delta = roundMoney(taxInclusiveTotal - payableTotal);
    if (delta > 0.005) withholdingTotal = delta;
  }

  const exemptionCode =
    pickStr(
      raw.taxExemptionReasonCode,
      raw.vatExemptionCode,
      raw.istisnaKodu,
      raw.exemptionCode,
    ) ?? exemptionCodeFromTaxNodes(raw);

  return {
    taxInclusiveTotal,
    payableTotal,
    withholdingTotal,
    exemptionCode,
  };
}
