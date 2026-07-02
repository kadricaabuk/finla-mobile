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
  items: InvoiceLineItem[]
  /** GG/AA/YYYY (Türkçe); GİB API'ye MM/DD/YYYY olarak dönüştürülür. */
  date?: string
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

  const items = input.items.map((item) => {
    const totalAmount = item.quantity * item.unitPrice
    const vatAmount = Math.round(totalAmount * item.vatRate) / 100
    return {
      name: item.name,
      quantity: item.quantity,
      unitType: normalizeGibUnit(item.unit),
      unitPrice: item.unitPrice,
      price: totalAmount,
      VATRate: item.vatRate,
      VATAmount: vatAmount,
      VATAmountOfTax: 0,
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

export type LocalDraftPreviewInput = {
  buyer_name?: string
  buyer_tax_id?: string
  date?: string
  currency?: string
  items?: {
    name?: string
    quantity?: number
    unit?: string
    unit_price?: number
    vat_rate?: number
    vat_exemption_code?: string
    withholding_code?: string
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
    const net = qty * unitPrice
    const vat = Math.round(net * vatRate) / 100
    const gross = net + vat
    const withholding = resolveTevkifatCode(item.withholding_code)
    const withholdingAmount = withholding
      ? Math.round(vat * withholding.numerator / withholding.denominator * 100) /
        100
      : 0
    return {
      name: item.name?.trim() || 'Kalem',
      qty,
      unit: item.unit?.trim() || 'adet',
      unitPrice,
      vatRate,
      net,
      vat,
      gross,
      exemptionCode: item.vat_exemption_code?.trim() || '',
      withholding,
      withholdingAmount,
    }
  })
  const netTotal = rows.reduce((s, r) => s + r.net, 0)
  const vatTotal = rows.reduce((s, r) => s + r.vat, 0)
  const grossTotal = netTotal + vatTotal
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
          <td>${escapeHtml(r.name)}</td>
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
  <h1>Taslak Fatura Özeti</h1>
  <div class="meta">
    ${buyer ? `<div>Alıcı: ${escapeHtml(buyer)}</div>` : ''}
    ${input.date ? `<div>Tarih: ${escapeHtml(input.date)}</div>` : ''}
    <div>Para birimi: ${escapeHtml(currency)}</div>
    ${exemptionNotes ? `<div>${exemptionNotes}</div>` : ''}
    ${withholdingNotes ? `<div>${withholdingNotes}</div>` : ''}
  </div>
  <table>
    <thead><tr><th>Kalem</th><th style="text-align:right">Miktar</th><th style="text-align:right">Birim fiyat</th><th style="text-align:right">KDV</th><th style="text-align:right">Toplam</th></tr></thead>
    <tbody>${itemRows}</tbody>
    <tfoot>
      <tr><td colspan="4">Ara toplam</td><td style="text-align:right">${formatTry(netTotal)} ${currency}</td></tr>
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
