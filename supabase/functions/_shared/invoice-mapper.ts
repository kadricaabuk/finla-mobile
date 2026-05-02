export interface InvoiceLineItem {
  name: string
  quantity: number
  unit: string
  unitPrice: number
  vatRate: number
}

export interface CreateInvoiceInput {
  buyerName: string
  buyerTaxId?: string
  buyerAddress?: string
  items: InvoiceLineItem[]
  date?: string
  currency?: string
}

export interface InvoiceFactRow {
  gib_username: string
  invoice_uuid: string
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

function todayFormatted(): string {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function nowTimeFormatted(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

export function buildInvoiceDetails(input: CreateInvoiceInput) {
  const items = input.items.map((item) => {
    const totalAmount = item.quantity * item.unitPrice
    const vatAmount = Math.round(totalAmount * item.vatRate) / 100
    return {
      name: item.name,
      quantity: item.quantity,
      unitType: item.unit || 'ADET',
      unitPrice: item.unitPrice,
      price: totalAmount,
      VATRate: item.vatRate,
      VATAmount: vatAmount,
      VATAmountOfTax: 0,
    }
  })
  const grandTotal = items.reduce((s, i) => s + i.price, 0)
  const totalVAT = items.reduce((s, i) => s + i.VATAmount, 0)
  return {
    date: input.date || todayFormatted(),
    time: nowTimeFormatted(),
    currency: input.currency || 'TRY',
    taxIDOrTRID: input.buyerTaxId || '11111111111',
    title: input.buyerName,
    fullAddress: input.buyerAddress || '',
    taxOffice: 'ISTANBUL',
    items,
    grandTotal,
    totalVAT,
    grandTotalInclVAT: grandTotal + totalVAT,
    paymentTotal: grandTotal + totalVAT,
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
  const m = value.trim().match(/^(\d{2})[./-](\d{2})[./-](\d{2,4})$/)
  if (!m) return null
  const year = m[3].length === 2 ? `20${m[3]}` : m[3]
  return `${year}-${m[2]}-${m[1]}`
}

function normalizeStatus(value: unknown): string {
  const raw = typeof value === 'string' ? value.toLocaleLowerCase('tr-TR') : ''
  if (raw.includes('iptal') || raw.includes('sil')) return 'cancelled'
  if (raw.includes('onay')) return 'approved'
  if (raw.includes('taslak') || raw.includes('onaylanmad')) return 'draft'
  return 'unknown'
}

function readInvoiceUuid(invoice: Record<string, unknown>): string | null {
  const ettn = typeof invoice.ettn === 'string' ? invoice.ettn.trim() : ''
  if (ettn) return ettn
  const docNo = typeof invoice.belgeNumarasi === 'string' ? invoice.belgeNumarasi.trim() : ''
  return docNo || null
}

export function mapInvoicesToFacts(username: string, invoices: unknown[]): InvoiceFactRow[] {
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

      return {
        gib_username: username,
        invoice_uuid: invoiceUuid,
        issue_date: parseIssueDate(invoice.belgeTarihi ?? invoice.faturaTarihi),
        status: normalizeStatus(invoice.onayDurumu),
        currency: typeof invoice.paraBirimi === 'string' ? invoice.paraBirimi : 'TRY',
        gross_total: grossTotal,
        vat_total: vatTotal,
        net_total: netTotal,
        customer_tax_id: typeof invoice.aliciVknTckn === 'string' ? invoice.aliciVknTckn : null,
        customer_name:
          typeof invoice.aliciUnvanAdSoyad === 'string'
            ? invoice.aliciUnvanAdSoyad
            : typeof invoice.aliciUnvan === 'string'
              ? invoice.aliciUnvan
              : null,
        raw_payload: invoice,
      }
    })
    .filter((row): row is InvoiceFactRow => row !== null)
}
