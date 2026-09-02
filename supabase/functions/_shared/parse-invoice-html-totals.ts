/**
 * GİB / Mysoft fatura HTML önizlemesinden tutar alanlarını çıkarır.
 *
 * Liste senkronu `payableAmount` (ödenecek) kullanır; tevkifatlı faturalarda
 * "Vergiler Dahil Toplam Tutar" tevkifat öncesi brütü gösterir. Detay ekranı
 * aynı `gross_total` semantiğini korusun diye önce "Ödenecek Tutar" okunur.
 */

export type ParsedInvoiceHtmlTotals = {
  net: number | null
  vat: number | null
  /** Ödenecek tutar (tevkifat sonrası); yoksa vergiler dahil toplam. */
  gross: number | null
  /** Vergiler dahil (tevkifat öncesi) — teşhis / fark analizi için. */
  taxInclusive: number | null
  /** Ödenecek tutar ham değeri (varsa). */
  payable: number | null
}

function parseMoney(input: string): number | null {
  const cleaned = input.replace(/[^\d,.-]/g, "").trim()
  if (!cleaned) return null
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

function pickLabeledAmount(plain: string, label: string): number | null {
  // Para birimi son eki (TL / TRY / USD / EUR) opsiyonel — şablon değişimine dayanıklı.
  const rx = new RegExp(
    `${label}[\\s\\S]{0,48}?([\\d\\.,]+)\\s*(?:TL|TRY|USD|EUR)?`,
    "i",
  )
  const m = plain.match(rx)
  return m ? parseMoney(m[1]) : null
}

/** HTML önizlemeden matrah / KDV / ödenecek tutarlarını okur. */
export function parseTotalsFromHtml(html: string): ParsedInvoiceHtmlTotals {
  const plain = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")

  const net = pickLabeledAmount(plain, "Mal Hizmet Toplam Tutar")
  const vat = pickLabeledAmount(plain, "Hesaplanan KDV")
  const taxInclusive = pickLabeledAmount(plain, "Vergiler Dahil Toplam Tutar")
  const payable =
    pickLabeledAmount(plain, "Ödenecek Tutar") ??
    pickLabeledAmount(plain, "Odenecek Tutar")

  // Liste ile aynı semantik: gross = ödenecek (payable), yoksa vergiler dahil.
  const gross = payable ?? taxInclusive

  return { net, vat, gross, taxInclusive, payable }
}
