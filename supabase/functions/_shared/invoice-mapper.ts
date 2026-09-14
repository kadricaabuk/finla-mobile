import {
  formatTevkifatRatio,
  resolveIstisnaName,
  resolveTevkifatCode,
} from './gib-tax-codes.ts'
import { normalizeGibUnit } from './gib-unit-codes.ts'
import {
  inboxDisplayToFactStatus,
  normalizeInboxDisplayStatus,
} from './incoming-invoice-status.ts'

export interface InvoiceLineItem {
  name: string
  quantity: number
  unit: string
  unitPrice: number
  vatRate: number
  /** KDV %0 satır için zorunlu GİB istisna kodu (ör. 302 hizmet ihracatı). */
  vatExemptionCode?: string
  /** Kısmi KDV tevkifatı kodu (601–627); oran koda göre sistemce belirlenir. */
  withholdingCode?: string
  /** Satır iskontosu yüzde (0–100). discountAmount ile birlikte verilemez. */
  discountRate?: number
  /** Satır iskontosu tutar (fatura para biriminde). */
  discountAmount?: number
}

/** Satır brüt/iskonto/matrah/KDV; tüm hesaplar tek yerden (kuruş yuvarlama). */
export function computeLineAmounts(item: InvoiceLineItem): {
  gross: number
  discount: number
  taxable: number
  vat: number
} {
  const round2 = (n: number) => Math.round(n * 100) / 100
  const gross = round2(item.quantity * item.unitPrice)
  let discount = 0
  if (typeof item.discountAmount === 'number' && item.discountAmount > 0) {
    discount = round2(item.discountAmount)
  } else if (typeof item.discountRate === 'number' && item.discountRate > 0) {
    discount = round2(gross * item.discountRate / 100)
  }
  const taxable = round2(gross - discount)
  // KDV matrahı iskonto SONRASI tutardan hesaplanır.
  const vat = round2(taxable * item.vatRate / 100)
  return { gross, discount, taxable, vat }
}

/** Miktar/fiyat/iskonto alanlarını doğrular; hata Türkçe mesajla fırlatılır. */
export function validateInvoiceLinePricing(items: InvoiceLineItem[]): void {
  for (const item of items) {
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      throw new Error('Kalem miktarı 0\'dan büyük olmalı.')
    }
    if (!Number.isFinite(item.unitPrice) || item.unitPrice < 0) {
      throw new Error('Birim fiyat negatif olamaz.')
    }
    const hasRate = typeof item.discountRate === 'number' && item.discountRate !== 0
    const hasAmount =
      typeof item.discountAmount === 'number' && item.discountAmount !== 0
    if (hasRate && hasAmount) {
      throw new Error(
        'Aynı kalemde hem iskonto oranı hem iskonto tutarı verilemez; birini seç.',
      )
    }
    if (hasRate && (item.discountRate! < 0 || item.discountRate! >= 100)) {
      throw new Error('İskonto oranı 0 ile 100 arasında olmalı.')
    }
    if (hasAmount && item.discountAmount! < 0) {
      throw new Error('İskonto tutarı negatif olamaz.')
    }
    const { gross, discount } = computeLineAmounts(item)
    if (discount > gross) {
      throw new Error(
        'İskonto tutarı kalem tutarını aşamaz.',
      )
    }
  }
}

/** İade faturası: iade edilen orijinal (bize kesilmiş) faturanın referansı. */
export interface ReturnInvoiceRef {
  /** Orijinal faturanın belge numarası (ör. ABC2026000000123). */
  invoiceNo: string
  /** Orijinal fatura tarihi GG/AA/YYYY. */
  invoiceDate: string
  /** İade sebebi (faturada billingRefNote olarak görünür). */
  reason?: string
}

/** GİB belge no: 3 alfanümerik ön ek + yıl + 9 haneli sıra (16 karakter). */
const GIB_DOC_NO_RE = /^[A-Z0-9]{3}\d{13}$/

/** İade referans alanlarını doğrular; hata Türkçe mesajla fırlatılır. */
export function validateReturnRef(ref: ReturnInvoiceRef): void {
  const no = ref.invoiceNo?.trim().toUpperCase() ?? ''
  const date = ref.invoiceDate?.trim() ?? ''
  if (!no || !date) {
    throw new Error(
      'İade faturası için orijinal faturanın belge numarası ve tarihi zorunlu.',
    )
  }
  if (!GIB_DOC_NO_RE.test(no)) {
    throw new Error(
      'İade edilen faturanın belge numarası geçersiz görünüyor (beklenen biçim: ABC2026000000123, 16 karakter). Numarayı orijinal faturadan birebir al.',
    )
  }
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(date)) {
    throw new Error(
      'İade edilen faturanın tarihi GG/AA/YYYY biçiminde olmalı.',
    )
  }
}

export interface CreateInvoiceInput {
  buyerName: string
  buyerTaxId?: string
  buyerAddress?: string
  /** Alıcı vergi dairesi (opsiyonel; lookup_recipient sonucundan). */
  taxOffice?: string
  /** Alıcı ülkesi; Türkiye dışıysa yurt dışı faturası kesilir. */
  buyerCountry?: string
  /** Alıcı şehri (yurt içi il veya yurt dışı şehir). */
  buyerCity?: string
  /** Dolu ise fatura İADE tipinde kesilir (alıcı = orijinal faturayı kesen). */
  returnRef?: ReturnInvoiceRef
  items: InvoiceLineItem[]
  /** GG/AA/YYYY (Türkçe); GİB API'ye MM/DD/YYYY olarak dönüştürülür. */
  date?: string
  /** Vade tarihi GG/AA/YYYY (opsiyonel). */
  dueDate?: string
  /** Fatura üzerinde görünecek serbest not (opsiyonel). */
  note?: string
  currency?: string
  /** Dövizli fatura: 1 birim dövizin TL karşılığı (ör. USD için 40.50). */
  currencyRate?: string
}

export type InvoiceDirection = 'outgoing' | 'incoming'

export interface UserData {
  taxIDOrTRID: string
  title: string
  name: string
  surname: string
  registryNo?: string
  mersisNo?: string
  taxOffice?: string
  fullAddress?: string
  buildingName?: string
  buildingNumber?: string
  doorNumber?: string
  town?: string
  district?: string
  city?: string
  zipCode?: string
  country?: string
  phoneNumber?: string
  faxNumber?: string
  email?: string
  webSite?: string
  businessCenter?: string
}

export interface InvoiceFactRow {
  gib_username: string
  invoice_uuid: string
  direction: InvoiceDirection
  issue_date: string | null
  status: string
  currency: string
  gross_total: number | null
  vat_total: number | null
  net_total: number | null
  customer_tax_id: string | null
  customer_name: string | null
  raw_payload: Record<string, unknown>
}

/** Bugünün tarihi GG/AA/YYYY (chat / tool girdisi). */
function todayTrFormatted(): string {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

/**
 * GİB fatura oluşturma API'si MM/DD/YYYY bekler (fatura integration testleri).
 * Finla girdisi GG/AA/YYYY → AA/GG/YYYY.
 */
export function trDateToGibApiFormat(trDate: string): string {
  const m = trDate.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return trDate.trim()
  const [, dd, mm, yyyy] = m
  return `${mm}/${dd}/${yyyy}`
}

export function todayGibApiFormatted(): string {
  return trDateToGibApiFormat(todayTrFormatted())
}

function nowTimeFormatted(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

export function normalizeCurrencyRate(raw: string): string {
  const normalized = raw.trim().replace(/\./g, '').replace(',', '.')
  const n = Number(normalized)
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(
      'Dövizli fatura için geçerli bir kur oranı gerekli (exchange_rate: 1 birim dövizin TL karşılığı).',
    )
  }
  return n.toFixed(4).replace(/\.?0+$/, '') || n.toString()
}

function resolveBuyerTaxId(buyerTaxId: string | undefined): string {
  const id = typeof buyerTaxId === 'string' ? buyerTaxId.replace(/\s/g, '') : ''
  return id
}

/** GİB HTML: TCKN (11 hane) alıcıda "SAYIN" adı çoğunlukla aliciAdi/aliciSoyadi; VKN (10 hane) için aliciUnvan. */
function recipientNameFields(
  buyerName: string,
  taxId: string,
): { title: string; name?: string; surname?: string } {
  const trimmed = buyerName.trim()
  const isVkn = taxId.length === 10 && /^\d{10}$/.test(taxId)
  const isTckn = taxId.length === 11 && /^\d{11}$/.test(taxId)

  if (isVkn) {
    return { title: trimmed }
  }

  if (isTckn) {
    const parts = trimmed.split(/\s+/).filter(Boolean)
    const name = parts[0] ?? trimmed
    const surname = parts.length > 1 ? parts.slice(1).join(' ') : name
    return { title: '', name, surname }
  }

  return { title: trimmed }
}

/**
 * Normalize create_invoice input into a GİB-shaped details object.
 *
 * Used only for logging / summarizeGibInvoicePayload — real GİB outbox bodies
 * are built by buildMysoftInvoiceOutboxBody. Keep line math aligned with
 * computeLineAmounts so discounted drafts do not mis-report matrah/KDV if this
 * path is ever reconnected.
 */
export function buildInvoiceDetails(input: CreateInvoiceInput) {
  const currency = (input.currency?.trim().toUpperCase() || 'TRY')
  let currencyRate: string | undefined
  if (currency !== 'TRY') {
    const rawRate = input.currencyRate?.trim()
    if (!rawRate) {
      throw new Error(
        'Dövizli fatura için exchange_rate zorunludur (1 birim dövizin TL karşılığı, örn. 40.50).',
      )
    }
    currencyRate = normalizeCurrencyRate(rawRate)
  }

  validateInvoiceLinePricing(input.items)

  const items = input.items.map((item) => {
    const { taxable, vat } = computeLineAmounts(item)
    return {
      name: item.name,
      quantity: item.quantity,
      unitType: normalizeGibUnit(item.unit),
      unitPrice: item.unitPrice,
      price: taxable,
      VATRate: item.vatRate,
      VATAmount: vat,
      VATAmountOfTax: 0,
      ...(typeof item.discountRate === 'number' && item.discountRate > 0
        ? { discountRate: item.discountRate }
        : {}),
      ...(typeof item.discountAmount === 'number' && item.discountAmount > 0
        ? { discountAmount: item.discountAmount }
        : {}),
    }
  })
  const grandTotal = items.reduce((s, i) => s + i.price, 0)
  const totalVAT = items.reduce((s, i) => s + i.VATAmount, 0)
  const taxId = resolveBuyerTaxId(input.buyerTaxId)
  const { title, name, surname } = recipientNameFields(input.buyerName, taxId)
  const trDate = input.date?.trim() || todayTrFormatted()
  const gibDate = trDateToGibApiFormat(trDate)
  const taxOffice =
    typeof input.taxOffice === 'string' ? input.taxOffice.trim() : ''
  const fullAddress = input.buyerAddress?.trim() || 'Test Sokak No:1'
  const country = 'Türkiye'

  return {
    date: gibDate,
    time: nowTimeFormatted(),
    currency,
    ...(currencyRate !== undefined ? { currencyRate } : {}),
    taxIDOrTRID: taxId,
    ...(title ? { title } : {}),
    ...(name !== undefined ? { name } : {}),
    ...(surname !== undefined ? { surname } : {}),
    fullAddress,
    country,
    ...(taxOffice ? { taxOffice } : {}),
    items,
    grandTotal,
    totalVAT,
    grandTotalInclVAT: grandTotal + totalVAT,
    paymentTotal: grandTotal + totalVAT,
  }
}

/** create_invoice hata loglarında GİB'e giden normalize alanların özeti. */
export function summarizeGibInvoicePayload(input: CreateInvoiceInput) {
  try {
    const details = buildInvoiceDetails(input)
    const trDate = input.date?.trim() || todayTrFormatted()
    return {
      tr_date: trDate,
      gib_date: details.date,
      country: details.country,
      tax_office: details.taxOffice,
      full_address: details.fullAddress,
      units: details.items.map((i) => i.unitType),
      currency: details.currency,
      tax_id_len: resolveBuyerTaxId(input.buyerTaxId).length,
    }
  } catch (e) {
    return {
      summary_error: e instanceof Error ? e.message : String(e),
      tr_date: input.date,
      units: input.items.map((i) => normalizeGibUnit(i.unit)),
    }
  }
}

function parseMaybeNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const normalized = value.trim().replace(/\./g, '').replace(',', '.')
  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function parseIssueDate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  const iso = trimmed.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const m = trimmed.match(/^(\d{2})[./-](\d{2})[./-](\d{2,4})$/)
  if (!m) return null
  const year = m[3].length === 2 ? `20${m[3]}` : m[3]
  // Mysoft / TR: GG/AA/YYYY
  const day = m[1]
  const month = m[2]
  return `${year}-${month}-${day}`
}

function normalizeOutgoingFactStatus(value: unknown): string {
  const raw = typeof value === 'string' ? value.toLocaleLowerCase('tr-TR') : ''
  if (raw.includes('iptal') || raw.includes('sil')) return 'cancelled'
  if (
    raw.includes('onay') ||
    raw.includes('kabul') ||
    raw.includes('gibe_gonderildi') ||
    raw.includes('basariyla')
  ) {
    return 'approved'
  }
  if (raw.includes('taslak') || raw.includes('onaylanmad')) return 'draft'
  return 'unknown'
}

function normalizeFactStatus(
  value: unknown,
  direction: InvoiceDirection,
): string {
  if (direction === 'incoming') {
    const display = normalizeInboxDisplayStatus(
      typeof value === 'string' ? value : '',
    )
    return inboxDisplayToFactStatus(display)
  }
  return normalizeOutgoingFactStatus(value)
}

function readInvoiceUuid(invoice: Record<string, unknown>): string | null {
  const ettn = typeof invoice.ettn === 'string' ? invoice.ettn.trim() : ''
  if (ettn) return ettn
  const docNo = typeof invoice.belgeNumarasi === 'string' ? invoice.belgeNumarasi.trim() : ''
  return docNo || null
}

function pickStr(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const t = value.trim()
  return t.length > 0 ? t : null
}

function combineNameParts(a: unknown, b: unknown): string | null {
  const p = [pickStr(a), pickStr(b)].filter(Boolean).join(' ').trim()
  return p.length > 0 ? p : null
}

/** Outgoing: counterparty = buyer (alıcı). Incoming: counterparty = issuer (gönderici). */
function readCounterpartyForFact(
  invoice: Record<string, unknown>,
  direction: InvoiceDirection,
): { customer_name: string | null; customer_tax_id: string | null } {
  if (direction === 'incoming') {
    return {
      customer_name:
        pickStr(invoice.gondericiUnvanAdSoyad) ??
        pickStr(invoice.gondericiUnvan) ??
        combineNameParts(invoice.gondericiAdi, invoice.gondericiSoyadi),
      customer_tax_id:
        pickStr(invoice.gondericiVknTckn) ??
        pickStr(invoice.gondericiVkn) ??
        pickStr(invoice.gondericiTckn),
    }
  }
  return {
    customer_name:
      pickStr(invoice.aliciUnvanAdSoyad) ??
      pickStr(invoice.aliciUnvan) ??
      combineNameParts(invoice.aliciAdi, invoice.aliciSoyadi),
    customer_tax_id: pickStr(invoice.aliciVknTckn) ?? pickStr(invoice.aliciVkn),
  }
}

export function mapInvoicesToFacts(
  username: string,
  invoices: unknown[],
  direction: InvoiceDirection = 'outgoing',
): InvoiceFactRow[] {
  return invoices
    .map((row): InvoiceFactRow | null => {
      if (!row || typeof row !== 'object') return null
      const invoice = row as Record<string, unknown>
      const invoiceUuid = readInvoiceUuid(invoice)
      if (!invoiceUuid) return null

      const grossTotal =
        parseMaybeNumber(invoice.vergilerDahilToplamTutar) ??
        parseMaybeNumber(invoice.odenecekTutar) ??
        null
      const netTotal =
        parseMaybeNumber(invoice.malhizmetToplamTutari) ??
        parseMaybeNumber(invoice.matrah) ??
        null
      const explicitVat =
        parseMaybeNumber(invoice.hesaplanankdv) ??
        parseMaybeNumber(invoice.vergilerToplami) ??
        null
      const vatTotal =
        explicitVat ??
        (grossTotal !== null && netTotal !== null ? grossTotal - netTotal : null)

      const cp = readCounterpartyForFact(invoice, direction)

      return {
        gib_username: username,
        invoice_uuid: invoiceUuid,
        direction,
        issue_date: parseIssueDate(invoice.belgeTarihi ?? invoice.faturaTarihi),
        status: normalizeFactStatus(invoice.onayDurumu, direction),
        currency: typeof invoice.paraBirimi === 'string' ? invoice.paraBirimi : 'TRY',
        gross_total: grossTotal,
        vat_total: vatTotal,
        net_total: netTotal,
        customer_tax_id: cp.customer_tax_id,
        customer_name: cp.customer_name,
        raw_payload: invoice,
      }
    })
    .filter((row): row is InvoiceFactRow => row !== null)
}

/** Gelen fatura listesinde belge numarası eşleşen satırı bulur. */
export function findIncomingInvoiceByDocNo(
  rows: unknown[],
  docNo: string,
): Record<string, unknown> | null {
  const target = docNo.trim().toUpperCase()
  if (!target) return null
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const no = String(r.belgeNumarasi ?? r.docNo ?? '').trim().toUpperCase()
    if (no && no === target) return r
  }
  return null
}

/** İade faturasını orijinal gelen faturayla karşılaştırır; uyumsuzlukta Türkçe hata fırlatır. */
export function assertReturnMatchesOriginal(
  original: Record<string, unknown>,
  iade: { buyerTaxId?: string; grossTotal: number; currency: string },
): void {
  const senderVkn = String(
    original.gondericiVknTckn ?? original.gondericiVkn ?? '',
  ).trim()
  const buyerVkn = (iade.buyerTaxId ?? '').replace(/\s/g, '')
  if (senderVkn && buyerVkn && senderVkn !== buyerVkn) {
    throw new Error(
      `İade faturası orijinal faturayı kesen tarafa düzenlenmeli: orijinal faturanın göndericisi VKN/TCKN ${senderVkn}, verilen alıcı ${buyerVkn}. Alıcı bilgisini orijinal faturadaki gönderici ile eşleştir.`,
    )
  }
  const iadeCurrency = iade.currency.trim().toUpperCase() || 'TRY'
  const originalCurrency =
    String(original.paraBirimi ?? 'TRY').trim().toUpperCase() || 'TRY'
  if (originalCurrency !== iadeCurrency) {
    throw new Error(
      `İade faturası orijinal faturayla aynı para biriminde kesilmeli (orijinal: ${originalCurrency}, iade: ${iadeCurrency}).`,
    )
  }
  const originalGross = parseMaybeNumber(original.vergilerDahilToplamTutar) ??
    parseMaybeNumber(original.odenecekTutar)
  if (originalGross !== null && iade.grossTotal > originalGross + 0.01) {
    const fmt = (n: number) =>
      n.toLocaleString('tr-TR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    throw new Error(
      `İade tutarı orijinal fatura toplamını aşamaz: orijinal KDV dahil ${fmt(originalGross)} ${originalCurrency}, iade ${fmt(iade.grossTotal)} ${iadeCurrency}. Kalem tutarlarını kontrol et.`,
    )
  }
}

export type LocalDraftPreviewInput = {
  buyer_name?: string
  buyer_tax_id?: string
  date?: string
  due_date?: string
  note?: string
  currency?: string
  return_ref_invoice_no?: string
  return_ref_invoice_date?: string
  return_reason?: string
  items?: {
    name?: string
    quantity?: number
    unit?: string
    unit_price?: number
    vat_rate?: number
    vat_exemption_code?: string
    withholding_code?: string
    discount_rate?: number
    discount_amount?: number
  }[]
}

function formatTry(amount: number): string {
  return amount.toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** GİB HTML/PDF alınamazsa gösterilecek yerel özet önizleme. */
export function buildLocalDraftPreviewHtml(
  input: LocalDraftPreviewInput,
): string {
  const currency = (input.currency?.trim().toUpperCase() || 'TRY')
  const rows = (input.items ?? []).map((item) => {
    const qty = Number(item.quantity ?? 1)
    const unitPrice = Number(item.unit_price ?? 0)
    const vatRate = Number(item.vat_rate ?? 0)
    const amounts = computeLineAmounts({
      name: item.name ?? '',
      quantity: qty,
      unit: item.unit ?? 'adet',
      unitPrice,
      vatRate,
      discountRate: item.discount_rate,
      discountAmount: item.discount_amount,
    })
    const withholding = resolveTevkifatCode(item.withholding_code)
    const withholdingAmount = withholding
      ? Math.round(
        amounts.vat * withholding.numerator / withholding.denominator * 100,
      ) / 100
      : 0
    return {
      name: item.name?.trim() || 'Kalem',
      qty,
      unit: item.unit?.trim() || 'adet',
      unitPrice,
      vatRate,
      net: amounts.gross,
      discount: amounts.discount,
      taxable: amounts.taxable,
      vat: amounts.vat,
      gross: amounts.taxable + amounts.vat,
      exemptionCode: item.vat_exemption_code?.trim() || '',
      withholding,
      withholdingAmount,
    }
  })
  const netTotal = rows.reduce((s, r) => s + r.net, 0)
  const discountTotal = rows.reduce((s, r) => s + r.discount, 0)
  const taxableTotal = rows.reduce((s, r) => s + r.taxable, 0)
  const vatTotal = rows.reduce((s, r) => s + r.vat, 0)
  const grossTotal = taxableTotal + vatTotal
  const withholdingTotal = rows.reduce((s, r) => s + r.withholdingAmount, 0)
  const payableTotal = grossTotal - withholdingTotal
  const buyer = [input.buyer_name, input.buyer_tax_id].filter(Boolean).join(' · ')

  const exemptionNotes = [
    ...new Set(rows.filter((r) => r.exemptionCode).map((r) => r.exemptionCode)),
  ]
    .map((code) => {
      const name = resolveIstisnaName(code)
      return `KDV istisnası: ${code}${name ? ` — ${name}` : ''}`
    })
    .join('<br/>')
  const withholdingNotes = [
    ...new Set(
      rows
        .filter((r) => r.withholding)
        .map(
          (r) =>
            `KDV tevkifatı: ${r.withholding!.code} — ${r.withholding!.name} (${formatTevkifatRatio(r.withholding!)})`,
        ),
    ),
  ].join('<br/>')

  const itemRows = rows
    .map(
      (r) =>
        `<tr>
          <td>${escapeHtml(r.name)}${r.discount > 0 ? `<br/><small>iskonto −${formatTry(r.discount)}</small>` : ''}</td>
          <td style="text-align:right">${r.qty} ${escapeHtml(r.unit)}</td>
          <td style="text-align:right">${formatTry(r.unitPrice)}</td>
          <td style="text-align:right">%${r.vatRate}${r.exemptionCode ? ` (istisna ${escapeHtml(r.exemptionCode)})` : ''}</td>
          <td style="text-align:right">${formatTry(r.gross)}</td>
        </tr>`,
    )
    .join('')

  return `<!DOCTYPE html>
<html lang="tr">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;margin:16px;color:#111;line-height:1.45}
  .banner{background:#fff8e6;border:1px solid #f0d78c;border-radius:8px;padding:12px;margin-bottom:16px;font-size:14px}
  h1{font-size:20px;margin:0 0 8px}
  .meta{color:#555;font-size:14px;margin-bottom:16px}
  table{width:100%;border-collapse:collapse;font-size:14px}
  th,td{border-bottom:1px solid #e5e5e5;padding:8px 4px;vertical-align:top}
  th{text-align:left;color:#666;font-weight:600}
  tfoot td{font-weight:600;border-top:2px solid #ccc}
</style></head>
<body>
  <div class="banner">GİB resmi önizlemesi şu an alınamadı. Aşağıda taslak özeti gösteriliyor; tutarları kontrol edip onaylayabilirsin.</div>
  <h1>Taslak ${input.return_ref_invoice_no ? 'İade Faturası' : 'Fatura'} Özeti</h1>
  <div class="meta">
    ${input.return_ref_invoice_no
      ? `<div><strong>İade edilen fatura:</strong> ${escapeHtml(input.return_ref_invoice_no)}${input.return_ref_invoice_date ? ` (${escapeHtml(input.return_ref_invoice_date)})` : ''}</div>`
      : ''}
    ${input.return_reason ? `<div>İade sebebi: ${escapeHtml(input.return_reason)}</div>` : ''}
    ${buyer ? `<div>Alıcı: ${escapeHtml(buyer)}</div>` : ''}
    ${input.date ? `<div>Tarih: ${escapeHtml(input.date)}</div>` : ''}
    ${input.due_date ? `<div>Vade tarihi: ${escapeHtml(input.due_date)}</div>` : ''}
    <div>Para birimi: ${escapeHtml(currency)}</div>
    ${exemptionNotes ? `<div>${exemptionNotes}</div>` : ''}
    ${withholdingNotes ? `<div>${withholdingNotes}</div>` : ''}
    ${input.note ? `<div>Not: ${escapeHtml(input.note)}</div>` : ''}
  </div>
  <table>
    <thead><tr><th>Kalem</th><th style="text-align:right">Miktar</th><th style="text-align:right">Birim fiyat</th><th style="text-align:right">KDV</th><th style="text-align:right">Toplam</th></tr></thead>
    <tbody>${itemRows}</tbody>
    <tfoot>
      <tr><td colspan="4">Ara toplam</td><td style="text-align:right">${formatTry(netTotal)} ${currency}</td></tr>
      ${discountTotal > 0
        ? `<tr><td colspan="4">Toplam iskonto</td><td style="text-align:right">−${formatTry(discountTotal)} ${currency}</td></tr>
      <tr><td colspan="4">Matrah</td><td style="text-align:right">${formatTry(taxableTotal)} ${currency}</td></tr>`
        : ''}
      <tr><td colspan="4">KDV</td><td style="text-align:right">${formatTry(vatTotal)} ${currency}</td></tr>
      <tr><td colspan="4">Genel toplam</td><td style="text-align:right">${formatTry(grossTotal)} ${currency}</td></tr>
      ${withholdingTotal > 0
        ? `<tr><td colspan="4">KDV tevkifatı (alıcı öder)</td><td style="text-align:right">−${formatTry(withholdingTotal)} ${currency}</td></tr>
      <tr><td colspan="4">Ödenecek tutar</td><td style="text-align:right">${formatTry(payableTotal)} ${currency}</td></tr>`
        : ''}
    </tfoot>
  </table>
</body></html>`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
