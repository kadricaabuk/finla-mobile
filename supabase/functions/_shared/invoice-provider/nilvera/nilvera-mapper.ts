import {
  computeLineAmounts,
  FOREIGN_BUYER_TAX_ID,
  isForeignBuyerCountry,
  validateInvoiceLinePricing,
  type CreateInvoiceInput,
} from '../../invoice-mapper.ts'
import { validateInvoiceTaxFields } from '../../gib-tax-codes.ts'
import { normalizeGibUnit } from '../../gib-unit-codes.ts'
import type { GibLikeInvoiceRow, RecipientLookupResult } from '../types.ts'

/** YYYY-MM-DD(...) → DD/MM/YYYY (TR); empty string if invalid. */
function isoDateToTrDate(iso: unknown): string {
  if (typeof iso !== 'string') return ''
  const d = iso.slice(0, 10)
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return ''
  return `${m[3]}/${m[2]}/${m[1]}`
}

/** DD/MM/YYYY (TR) → ISO datetime (for Nilvera's IssueDate field). */
function trDateToIso(trDate: string | undefined): string {
  const trimmed = trDate?.trim()
  if (!trimmed) return new Date().toISOString()
  const m = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return new Date().toISOString()
  return `${m[3]}-${m[2]}-${m[1]}T00:00:00`
}

/** Nilvera Sale.StatusCode: unknown | waiting | succeed | error. */
export function mapNilveraOutgoingStatus(statusCode: unknown): string {
  switch (statusCode) {
    case 'succeed':
      return 'Onaylandı'
    case 'waiting':
      return 'Gönderildi'
    case 'error':
      return 'Hata'
    default:
      return 'Bilinmiyor'
  }
}

/**
 * Nilvera Purchase.AnswerCode: waitingForApproval | approved | rejected |
 * documentAnsweredAutomatically (TEMELFATURA — auto-accepted, cannot be rejected).
 */
export function mapNilveraIncomingStatus(
  answerCode: unknown,
  statusCode: unknown,
): string {
  switch (answerCode) {
    case 'approved':
      return 'Kabul'
    case 'rejected':
      return 'Red'
    case 'documentAnsweredAutomatically':
      return 'Kabul'
    case 'waitingForApproval':
      return 'Yanıt Bekleniyor'
  }
  if (statusCode === 'error') return 'İptal'
  return 'Yanıt Bekleniyor'
}

export function mapNilveraSaleToGibLike(
  row: Record<string, unknown>,
  channel: 'einvoice' | 'earchive',
): GibLikeInvoiceRow {
  const trDate = isoDateToTrDate(row.IssueDate)
  return {
    ettn: typeof row.UUID === 'string' ? row.UUID : '',
    belgeNumarasi: typeof row.InvoiceNumber === 'string' ? row.InvoiceNumber : undefined,
    faturaTarihi: trDate,
    belgeTarihi: trDate,
    aliciUnvan: row.ReceiverName,
    aliciUnvanAdSoyad: row.ReceiverName,
    aliciVknTckn: row.ReceiverTaxNumber,
    vergilerDahilToplamTutar: row.PayableAmount,
    malhizmetToplamTutari: row.TaxExclusiveAmount,
    paraBirimi: typeof row.CurrencyCode === 'string' ? row.CurrencyCode : 'TRY',
    onayDurumu: mapNilveraOutgoingStatus(row.StatusCode),
    belgeTuru: channel === 'einvoice' ? 'EFATURA' : 'EARSIVFATURA',
    ...row,
  }
}

export function mapNilveraPurchaseToGibLike(
  row: Record<string, unknown>,
): GibLikeInvoiceRow {
  const trDate = isoDateToTrDate(row.IssueDate)
  return {
    ettn: typeof row.UUID === 'string' ? row.UUID : '',
    belgeNumarasi: typeof row.InvoiceNumber === 'string' ? row.InvoiceNumber : undefined,
    faturaTarihi: trDate,
    belgeTarihi: trDate,
    gondericiUnvan: row.SenderName,
    gondericiUnvanAdSoyad: row.SenderName,
    gondericiVknTckn: row.SenderTaxNumber,
    vergilerDahilToplamTutar: row.PayableAmount,
    malhizmetToplamTutari: row.TaxExclusiveAmount,
    paraBirimi: typeof row.CurrencyCode === 'string' ? row.CurrencyCode : 'TRY',
    onayDurumu: mapNilveraIncomingStatus(row.AnswerCode, row.StatusCode),
    belgeTuru: 'EFATURA',
    ...row,
  }
}

/** Recipient info from GET /general/GlobalCompany/Check/TaxNumber/{vkn}. */
export function mapNilveraRecipient(
  taxId: string,
  rows: Record<string, unknown>[],
): RecipientLookupResult | null {
  if (rows.length === 0) return null
  const row = rows[0]
  return {
    tax_id: taxId,
    name: String(row.Title ?? row.Name ?? ''),
    is_efatura: true,
  }
}

/**
 * GET /general/Company field names are unverified; assumed to match the
 * SendModelCommand.CompanyInfo schema (Name/TaxOffice/Address/District/City/
 * Country/PostalCode/Phone/Mail/WebSite). Confirm before going live.
 */
export function mapNilveraCompanyToProfile(
  company: Record<string, unknown> | null,
  ctx: { tenantVkn?: string; phone?: string },
): Record<string, unknown> {
  const tenantVkn = ctx.tenantVkn?.trim() ?? ''
  return {
    taxIDOrTRID: String(company?.TaxNumber ?? tenantVkn),
    title: String(company?.Name ?? ''),
    name: '',
    surname: '',
    taxOffice: typeof company?.TaxOffice === 'string' ? company.TaxOffice : undefined,
    fullAddress: typeof company?.Address === 'string' ? company.Address : undefined,
    city: typeof company?.City === 'string' ? company.City : undefined,
    district: typeof company?.District === 'string' ? company.District : undefined,
    zipCode: typeof company?.PostalCode === 'string' ? company.PostalCode : undefined,
    country: typeof company?.Country === 'string' ? company.Country : 'Türkiye',
    phoneNumber: typeof company?.Phone === 'string' ? company.Phone : ctx.phone,
    email: typeof company?.Mail === 'string' ? company.Mail : undefined,
    webSite: typeof company?.WebSite === 'string' ? company.WebSite : undefined,
  }
}

export interface NilveraCompanyInfo {
  name?: string
  taxOffice?: string
  address?: string
  district?: string
  city?: string
  country?: string
  postalCode?: string
  phone?: string
  mail?: string
  webSite?: string
}

/**
 * Builds the SendModelCommand body (same schema for POST /einvoice/Send/Model,
 * /einvoice/Draft/Create, and their e-Arşiv equivalents).
 *
 * NOTE: Nilvera's per-line VAT-exemption/withholding code fields could not be
 * confirmed from their API docs (only KDVPercent/KDVTotal were documented).
 * Exemption/withholding or return (returnRef) invoices are therefore rejected
 * here with a clear error, rather than risking an incorrect tax declaration
 * without live swagger verification.
 */
export function buildNilveraInvoiceModel(
  input: CreateInvoiceInput,
  tenantVkn: string,
  recipient: RecipientLookupResult | null,
  companyInfo: NilveraCompanyInfo,
): Record<string, unknown> {
  const foreignBuyer = isForeignBuyerCountry(input.buyerCountry)
  let taxId = (input.buyerTaxId ?? '').replace(/\s/g, '')
  if (foreignBuyer) {
    if (!/^\d{10,11}$/.test(taxId)) taxId = FOREIGN_BUYER_TAX_ID
  } else if (!/^\d{10,11}$/.test(taxId)) {
    throw new Error('Alıcı VKN/TCKN geçersiz veya eksik.')
  }

  validateInvoiceLinePricing(input.items)
  const { hasWithholding, allExempt } = validateInvoiceTaxFields(input.items)
  if (hasWithholding || allExempt) {
    throw new Error(
      'Tevkifatlı/istisnalı faturalar Nilvera entegrasyonunda henüz desteklenmiyor.',
    )
  }
  if (input.returnRef) {
    throw new Error('İade faturaları Nilvera entegrasyonunda henüz desteklenmiyor.')
  }

  const currency = input.currency?.trim().toUpperCase() || 'TRY'
  let exchangeRate: number | null = null
  if (currency !== 'TRY') {
    const rate = Number(input.currencyRate?.trim().replace(',', '.'))
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error('Dövizli fatura için geçerli kur zorunlu (exchange_rate).')
    }
    exchangeRate = rate
  }

  const lines = input.items.map((item) => {
    const amounts = computeLineAmounts(item)
    return {
      Name: item.name,
      Quantity: item.quantity,
      UnitType: normalizeGibUnit(item.unit),
      Price: item.unitPrice,
      AllowanceTotal: amounts.discount,
      KDVPercent: item.vatRate,
      KDVTotal: amounts.vat,
    }
  })

  const lineExtensionAmount = lines.reduce((s, l) => s + l.Price * l.Quantity, 0)
  const allowanceTotal = lines.reduce((s, l) => s + l.AllowanceTotal, 0)
  const kdvTotal = lines.reduce((s, l) => s + l.KDVTotal, 0)
  const kdvTotalsByRate: Record<number, number> = {}
  for (const line of lines) {
    kdvTotalsByRate[line.KDVPercent] = (kdvTotalsByRate[line.KDVPercent] ?? 0) + line.KDVTotal
  }
  const payableAmount = lineExtensionAmount - allowanceTotal + kdvTotal

  const isEfatura = Boolean(recipient?.is_efatura) && !foreignBuyer
  const profile = isEfatura ? 'TEMELFATURA' : 'TEMELFATURA'
  const invoiceDate = trDateToIso(input.date)

  const body: Record<string, unknown> = {
    EInvoice: {
      InvoiceInfo: {
        UUID: crypto.randomUUID(),
        InvoiceType: 'SATIS',
        IssueDate: invoiceDate,
        CurrencyCode: currency,
        ExchangeRate: exchangeRate,
        InvoiceProfile: profile,
        LineExtensionAmount: lineExtensionAmount,
        GeneralKDV1Total: kdvTotalsByRate[1] ?? 0,
        GeneralKDV8Total: kdvTotalsByRate[8] ?? 0,
        GeneralKDV10Total: kdvTotalsByRate[10] ?? 0,
        GeneralKDV18Total: kdvTotalsByRate[18] ?? 0,
        GeneralKDV20Total: kdvTotalsByRate[20] ?? 0,
        GeneralAllowanceTotal: allowanceTotal,
        PayableAmount: payableAmount,
        KdvTotal: kdvTotal,
      },
      CompanyInfo: {
        TaxNumber: tenantVkn,
        Name: companyInfo.name ?? '',
        TaxOffice: companyInfo.taxOffice ?? '',
        Address: companyInfo.address ?? '',
        District: companyInfo.district ?? '',
        City: companyInfo.city ?? '',
        Country: companyInfo.country ?? 'Türkiye',
        PostalCode: companyInfo.postalCode ?? '',
        Phone: companyInfo.phone ?? '',
        Mail: companyInfo.mail ?? '',
        WebSite: companyInfo.webSite ?? '',
      },
      CustomerInfo: {
        TaxNumber: taxId,
        Name: input.buyerName.trim(),
        Address: input.buyerAddress?.trim() ?? '',
        District: '',
        City: input.buyerCity?.trim() ?? (foreignBuyer ? input.buyerCountry?.trim() ?? '' : ''),
        Country: foreignBuyer ? input.buyerCountry!.trim() : 'Türkiye',
        PostalCode: '',
      },
      InvoiceLines: lines,
      Notes: input.note?.trim() ? [input.note.trim().slice(0, 500)] : [],
    },
    CustomerAlias: null,
  }

  return body
}
