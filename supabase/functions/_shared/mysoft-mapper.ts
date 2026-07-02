import {
  resolveIstisnaName,
  resolveTevkifatCode,
  validateInvoiceTaxFields,
} from './gib-tax-codes.ts'
import { normalizeGibUnit } from './gib-unit-codes.ts'
import {
  normalizeInboxDisplayStatus,
  parseMysoftInboxStatusRaw,
} from './incoming-invoice-status.ts'
import { toIsoDate } from './invoice-facts.ts'
import type { CreateInvoiceInput } from './invoice-mapper.ts'
import type { RecipientLookupResult } from './invoice-provider/types.ts'

/** GG/AA/YYYY → YYYY-MM-DD */
export function trDateToMysoftDate(trDate: string): string {
  return toIsoDate(trDate)
}

/**
 * Mysoft liste API tarih aralığı.
 * startDate === endDate (tek gün) sorgusu API'den boş döner; queryEnd +1 gün gönderilir.
 */
export function mysoftListQueryDateRange(
  startDateTr: string,
  endDateTr: string,
): {
  queryStart: string
  queryEnd: string
  filterStartIso: string
  filterEndIso: string
} {
  const filterStartIso = trDateToMysoftDate(startDateTr)
  const filterEndIso = trDateToMysoftDate(endDateTr)
  let queryEnd = filterEndIso
  if (filterStartIso === filterEndIso) {
    const [y, m, d] = filterEndIso.split('-').map(Number)
    queryEnd = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
  }
  return {
    queryStart: filterStartIso,
    queryEnd,
    filterStartIso,
    filterEndIso,
  }
}

/** ISO YYYY-MM-DD → +N gün */
export function addIsoDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** Gelen kutu liste API'si için `YYYY-MM-DD HH:mm:ss` aralığı. */
export function mysoftInboxListDateTimes(
  startDateTr: string,
  endDateTr: string,
): {
  startDateTime: string
  endDateTime: string
  filterStartIso: string
  filterEndIso: string
} {
  const range = mysoftListQueryDateRange(startDateTr, endDateTr)
  // Postman: endDate = aralığın ertesi günü 00:00:00 (üst sınır dışlayıcı)
  const apiEndDay = addIsoDays(range.filterEndIso, 1)
  return {
    startDateTime: `${range.filterStartIso} 00:00:00`,
    endDateTime: `${apiEndDay} 00:00:00`,
    filterStartIso: range.filterStartIso,
    filterEndIso: range.filterEndIso,
  }
}

function rowDocDateIso(row: Record<string, unknown>): string | null {
  const raw = String(
    row.docDate ?? row.invoiceDate ?? row.belgeTarihi ?? '',
  ).trim()
  if (!raw) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10)
  const eu = raw.match(/^(\d{2})[./](\d{2})[./](\d{4})/)
  if (eu) return `${eu[3]}-${eu[2]}-${eu[1]}`
  return null
}

/** Genişletilmiş API yanıtını istenen TR tarih aralığına süzer (docDate). */
export function filterMysoftRowsByDocDate(
  rows: Record<string, unknown>[],
  startIso: string,
  endIso: string,
): Record<string, unknown>[] {
  return rows.filter((row) => {
    const docIso = rowDocDateIso(row)
    if (!docIso) return true
    return docIso >= startIso && docIso <= endIso
  })
}

/** YYYY-MM-DD veya ISO → GG/AA/YYYY (chat draft ref) */
export function mysoftDateToTrDate(value: string): string {
  const iso = value.trim().slice(0, 10)
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return value
  return `${m[3]}/${m[2]}/${m[1]}`
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

function formatMoney(n: number): string {
  return roundMoney(n).toFixed(2)
}

function nowDocTime(docDate: string): string {
  const d = new Date()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${docDate} ${hh}:${mm}`
}

function resolveBuyerTaxId(buyerTaxId: string | undefined): string {
  return typeof buyerTaxId === 'string' ? buyerTaxId.replace(/\s/g, '') : ''
}

function isEfaturaRecipient(recipient: RecipientLookupResult | null): boolean {
  if (!recipient) return false
  if (recipient.is_efatura) return true
  return Boolean(recipient.pk_alias)
}

/** Yurt dışı alıcı: GİB kuralı gereği VKN alanına "2222222222" yazılır. */
const FOREIGN_BUYER_TAX_ID = '2222222222'

export function isForeignBuyerCountry(country: string | undefined): boolean {
  const c = (country ?? '').trim().toLocaleLowerCase('tr-TR')
  if (!c) return false
  return c !== 'türkiye' && c !== 'turkiye' && c !== 'turkey' && c !== 'tr'
}

export function buildMysoftInvoiceOutboxBody(
  input: CreateInvoiceInput,
  tenantVkn: string,
  recipient: RecipientLookupResult | null,
  options: { isSaveAsDraft: boolean; ettn?: string; gbAlias?: string },
): Record<string, unknown> {
  const foreignBuyer = isForeignBuyerCountry(input.buyerCountry)
  let taxId = resolveBuyerTaxId(input.buyerTaxId)
  if (foreignBuyer) {
    if (!/^\d{10,11}$/.test(taxId)) taxId = FOREIGN_BUYER_TAX_ID
  } else if (!/^\d{10,11}$/.test(taxId)) {
    throw new Error('Alıcı VKN/TCKN geçersiz veya eksik.')
  }

  const { hasWithholding, allExempt } = validateInvoiceTaxFields(input.items)

  const trDate = input.date?.trim() || mysoftDateToTrDate(new Date().toISOString())
  const docDate = trDateToMysoftDate(trDate)
  const currency = (input.currency?.trim().toUpperCase() || 'TRY')
  let currencyRate = '1'
  if (currency !== 'TRY') {
    const rawRate = input.currencyRate?.trim()
    if (!rawRate || !Number.isFinite(Number(rawRate)) || Number(rawRate) <= 0) {
      throw new Error(
        'Dövizli fatura için geçerli kur zorunlu (1 birim dövizin TL karşılığı).',
      )
    }
    currencyRate = rawRate
  }
  // Yurt dışı alıcıya e-Fatura kesilemez; her zaman e-Arşiv düzenlenir.
  const efatura = !foreignBuyer && isEfaturaRecipient(recipient)

  const invoiceDetail = input.items.map((item) => {
    const qty = item.quantity
    const unitPrice = item.unitPrice
    const amtTra = roundMoney(qty * unitPrice)
    const amtVatTra = roundMoney(amtTra * item.vatRate / 100)
    const exemptionCode = item.vatExemptionCode?.trim() || ''
    const exemptionName = exemptionCode
      ? resolveIstisnaName(exemptionCode) ?? ''
      : ''
    const withholding = resolveTevkifatCode(item.withholdingCode)
    const withholdingAmount = withholding
      ? roundMoney(amtVatTra * withholding.numerator / withholding.denominator)
      : 0
    return {
      productName: item.name,
      unitCode: normalizeGibUnit(item.unit),
      qty: String(qty),
      unitPriceTra: formatMoney(unitPrice),
      amtTra: formatMoney(amtTra),
      vatRate: String(item.vatRate),
      amtVatTra: formatMoney(amtVatTra),
      taxableAmtTra: amtTra,
      ...(exemptionCode
        ? {
          taxExemptionReasonCode: exemptionCode,
          taxExemptionReasonName: exemptionName,
        }
        : {}),
      ...(withholding
        ? {
          withholdingTaxTypeCode: withholding.code,
          withholdingTaxTypeName: withholding.name,
          withholdingTaxPercentage: roundMoney(
            withholding.numerator / withholding.denominator * 100,
          ),
          withholdingTaxableAmount: amtVatTra,
          withholdingTaxAmount: withholdingAmount,
        }
        : {}),
    }
  })

  const lineExtensionAmount = roundMoney(
    invoiceDetail.reduce((s, row) => s + Number(row.taxableAmtTra), 0),
  )
  const taxAmount = roundMoney(
    invoiceDetail.reduce((s, row) => s + Number(row.amtVatTra), 0),
  )
  const taxInclusiveAmount = roundMoney(lineExtensionAmount + taxAmount)
  const withholdingTotal = roundMoney(
    invoiceDetail.reduce(
      (s, row) => s + Number(row.withholdingTaxAmount ?? 0),
      0,
    ),
  )
  const payableAmount = roundMoney(taxInclusiveAmount - withholdingTotal)

  const subTotalKeys = [
    ...new Set(
      input.items.map((i) =>
        `${i.vatRate}|${i.vatExemptionCode?.trim() || ''}`
      ),
    ),
  ]
  const taxSubTotal = subTotalKeys.map((key) => {
    const [rate, exemptionCode] = key.split('|')
    const rows = invoiceDetail.filter((r) =>
      r.vatRate === rate &&
      ((r as Record<string, unknown>).taxExemptionReasonCode ?? '') ===
        exemptionCode
    )
    const taxableAmount = roundMoney(
      rows.reduce((s, r) => s + Number(r.taxableAmtTra), 0),
    )
    const vat = roundMoney(rows.reduce((s, r) => s + Number(r.amtVatTra), 0))
    return {
      taxableAmount,
      taxAmount: vat,
      calculationSequenceNumeric: 0,
      percent: rate,
      taxName: 'Katma Değer Vergisi',
      taxTypeCode: '0015',
      ...(exemptionCode
        ? {
          taxExemptionReasonCode: exemptionCode,
          taxExemptionReasonName: resolveIstisnaName(exemptionCode) ?? '',
        }
        : {}),
    }
  })

  const invoiceType = hasWithholding
    ? 'TEVKIFAT'
    : allExempt
      ? 'ISTISNA'
      : 'SATIS'

  // GİB kuralı: tevkifatlı e-Fatura, alıcının red hakkı olan TİCARİFATURA
  // senaryosuyla gönderilmek zorunda (TEMELFATURA reddedilemez).
  const profile = efatura
    ? (hasWithholding ? 'TICARIFATURA' : 'TEMELFATURA')
    : 'EARSIVFATURA'

  const cityName = input.buyerCity?.trim() ||
    (foreignBuyer
      ? input.buyerCountry?.trim() || 'Yurt Dışı'
      : recipient?.address?.trim() || 'İstanbul')

  const body: Record<string, unknown> = {
    isSaveAsDraft: options.isSaveAsDraft,
    isCalculateByApi: false,
    id: 0,
    eDocumentType: efatura ? 'EFATURA' : 'EARSIVFATURA',
    invoiceType,
    profile,
    ettn: options.ettn ?? '',
    docNo: '',
    docDate,
    docTime: nowDocTime(docDate),
    currencyCode: currency,
    currencyRate,
    tenantIdentifierNumber: tenantVkn,
    senderType: 'ELEKTRONIK',
    invoiceAccount: {
      vknTckn: taxId,
      accountName: input.buyerName.trim(),
      countryName: foreignBuyer
        ? input.buyerCountry!.trim()
        : 'TÜRKİYE',
      cityName,
      citySubdivision: 'Merkez',
      ...(input.taxOffice?.trim() || recipient?.tax_office?.trim()
        ? {
          taxOfficeName: input.taxOffice?.trim() ||
            recipient?.tax_office?.trim(),
        }
        : {}),
      ...(input.buyerAddress?.trim()
        ? { streetName: input.buyerAddress.trim() }
        : {}),
    },
    tax: [
      {
        taxAmount,
        taxSubTotal,
      },
    ],
    isManuelCalculation: true,
    invoiceCalculation: {
      lineExtensionAmount,
      taxExclusiveAmount: lineExtensionAmount,
      taxInclusiveAmount,
      payableAmount,
      allowanceTotalAmount: 0,
    },
    invoiceDetail,
  }

  if (efatura && recipient?.pk_alias) {
    body.pkAlias = recipient.pk_alias
  }
  if (options.gbAlias) {
    body.gbAlias = options.gbAlias
  } else if (!efatura) {
    // e-Arşiv gönderiminde de gbAlias çoğu tenant'ta zorunlu (Mysoft imza)
    console.warn(
      JSON.stringify({
        event: 'mysoft_missing_gb_alias',
        tenant_vkn: tenantVkn,
        e_document_type: body.eDocumentType,
      }),
    )
  }

  return body
}

export function extractMysoftEttn(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const row = payload as Record<string, unknown>
  for (const key of [
    'invoiceETTN',
    'invoiceEttn',
    'ettn',
    'ETTN',
    'uuid',
  ]) {
    const value = row[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  const nested = row.data
  if (nested && typeof nested === 'object') {
    return extractMysoftEttn(nested)
  }
  return null
}

/** Mysoft liste yanıtından satır dizisini çıkarır (iç içe data/list anahtarları). */
export function extractMysoftListRows(payload: unknown): Record<string, unknown>[] {
  if (!payload) return []
  if (Array.isArray(payload)) {
    return payload.filter((r): r is Record<string, unknown> =>
      !!r && typeof r === 'object' && !Array.isArray(r)
    )
  }
  if (typeof payload !== 'object') return []

  const obj = payload as Record<string, unknown>

  // Mysoft sık döner: { data: [ {...}, ... ], succeed: true, ... }
  if (Array.isArray(obj.data)) {
    const fromData = extractMysoftListRows(obj.data)
    if (fromData.length > 0) return fromData
  }

  const preferredKeys = [
    'invoiceOutboxWithHeaderInfoList',
    'invoiceOutboxHeaderInfoList',
    'invoiceOutboxList',
    'invoiceInboxWithHeaderInfoList',
    'invoiceInboxList',
    'headerInfoList',
    'items',
    'list',
    'result',
    'records',
  ]

  for (const key of preferredKeys) {
    if (!(key in obj)) continue
    const extracted = extractMysoftListRows(obj[key])
    if (extracted.length > 0) return extracted
  }

  // `data` nesne ise içindeki dizileri tara
  if (obj.data && typeof obj.data === 'object' && !Array.isArray(obj.data)) {
    const fromNested = extractMysoftListRows(obj.data)
    if (fromNested.length > 0) return fromNested
  }

  // Son çare: üst seviyede herhangi bir dizi-değer
  for (const value of Object.values(obj)) {
    if (!Array.isArray(value) || value.length === 0) continue
    if (typeof value[0] === 'object' && value[0] !== null && !Array.isArray(value[0])) {
      return value as Record<string, unknown>[]
    }
  }

  return []
}

function mysoftDisplayName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed || trimmed.startsWith('urn:mail:')) return undefined
  return trimmed
}

function mysoftOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

/** Mysoft header satırını mevcut `mapInvoicesToFacts` ile uyumlu GİB-benzeri forma çevirir. */
export function mapMysoftHeaderToGibLike(row: Record<string, unknown>): Record<string, unknown> {
  const ettn =
    (typeof row.invoiceETTN === 'string' && row.invoiceETTN) ||
    (typeof row.invoiceEttn === 'string' && row.invoiceEttn) ||
    (typeof row.ettn === 'string' && row.ettn) ||
    (typeof row.ETTN === 'string' && row.ETTN) ||
    ''

  const docDate =
    (typeof row.docDate === 'string' && row.docDate) ||
    (typeof row.invoiceDate === 'string' && row.invoiceDate) ||
    (typeof row.belgeTarihi === 'string' && row.belgeTarihi) ||
    ''

  let faturaTarihi = docDate
  const iso = docDate.slice(0, 10)
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) {
    // GG/AA/YYYY (TR)
    faturaTarihi = `${m[3]}/${m[2]}/${m[1]}`
  }

  const status = parseMysoftInboxStatusRaw(row) || 'Bilinmiyor'

  const gross =
    row.payableAmount ??
    row.taxInclusiveAmount ??
    row.vergilerDahilToplamTutar ??
    row.totalAmount

  const net =
    row.taxExclusiveAmount ??
    row.lineExtensionAmount ??
    row.malhizmetToplamTutari

  return {
    ettn,
    belgeNumarasi: typeof row.docNo === 'string' ? row.docNo : undefined,
    faturaTarihi,
    belgeTarihi: faturaTarihi,
    aliciUnvan:
      row.accountName ??
      row.buyerTitle ??
      row.buyerAccountName ??
      row.aliciUnvan ??
      row.customerName,
    aliciUnvanAdSoyad:
      row.accountName ??
      row.buyerTitle ??
      row.aliciUnvanAdSoyad,
    aliciVknTckn:
      row.accountVknTckn ??
      row.buyerVknTckn ??
      row.vknTckn ??
      row.aliciVknTckn,
    vergilerDahilToplamTutar: gross,
    malhizmetToplamTutari: net,
    paraBirimi:
      row.currencyCode ??
      row.paraBirimi ??
      'TRY',
    onayDurumu: status,
    belgeTuru:
      row.eDocumentType ??
      row.profile ??
      row.belgeTuru,
    ...row,
  }
}

/** Gelen kutu header satırı — `accountName` tedarikçi (gönderici) unvanıdır. */
export function mapMysoftInboxHeaderToGibLike(
  row: Record<string, unknown>,
): Record<string, unknown> {
  const mapped = mapMysoftHeaderToGibLike(row)
  const senderName =
    mysoftDisplayName(row.supplierName) ??
    mysoftDisplayName(row.senderName) ??
    mysoftDisplayName(row.gondericiUnvan) ??
    mysoftDisplayName(row.accountName)
  const senderVkn =
    mysoftDisplayName(row.supplierVknTckn) ??
    mysoftDisplayName(row.senderVknTckn) ??
    mysoftDisplayName(row.gondericiVknTckn)

  const rawStatus = parseMysoftInboxStatusRaw(row) ||
    (typeof mapped.onayDurumu === 'string' ? mapped.onayDurumu : 'Bilinmiyor')

  return {
    ...mapped,
    gondericiUnvan: senderName,
    gondericiUnvanAdSoyad: senderName,
    gondericiVknTckn: senderVkn,
    onayDurumu: normalizeInboxDisplayStatus(rawStatus),
  }
}

export function pickMysoftCompanyRow(
  payload: unknown,
  tenantVkn?: string,
): Record<string, unknown> | null {
  let rows: Record<string, unknown>[] = []
  if (Array.isArray(payload)) {
    rows = payload.filter((row): row is Record<string, unknown> =>
      !!row && typeof row === 'object' && !Array.isArray(row)
    )
  } else if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>
    if (Array.isArray(obj.data)) {
      rows = obj.data.filter((row): row is Record<string, unknown> =>
        !!row && typeof row === 'object' && !Array.isArray(row)
      )
    } else {
      rows = [obj]
    }
  }

  const vkn = tenantVkn?.trim()
  if (vkn) {
    const matched = rows.find((row) =>
      String(row.identifierNumber ?? row.vknTckn ?? row.taxId ?? '').trim() ===
        vkn
    )
    if (matched) return matched
  }
  return rows[0] ?? null
}

export function mapMysoftUserProfile(
  company: Record<string, unknown> | null,
  userInfo: Record<string, unknown> | null,
  ctx: { tenantVkn?: string; phone?: string },
): Record<string, unknown> {
  const tenantVkn = ctx.tenantVkn?.trim() ?? ''
  const street = mysoftOptionalString(company?.street) ??
    mysoftOptionalString(company?.address) ??
    mysoftOptionalString(company?.fullAddress)

  return {
    taxIDOrTRID: String(
      company?.identifierNumber ??
        company?.vknTckn ??
        company?.taxId ??
        tenantVkn,
    ),
    title: String(
      company?.name ??
        company?.companyName ??
        company?.title ??
        company?.accountName ??
        '',
    ),
    name: String(userInfo?.name ?? ''),
    surname: String(userInfo?.surname ?? ''),
    mersisNo: mysoftOptionalString(company?.mersisNo ?? company?.mersisNumber),
    taxOffice: mysoftOptionalString(
      company?.taxOfficeName ?? company?.taxOffice,
    ),
    fullAddress: street,
    buildingName: mysoftOptionalString(company?.buildingName),
    buildingNumber: mysoftOptionalString(company?.buildingNumber),
    doorNumber: mysoftOptionalString(company?.room ?? company?.doorNumber),
    district: mysoftOptionalString(
      company?.citySubdivision ?? company?.district,
    ),
    city: mysoftOptionalString(company?.city ?? company?.cityName),
    zipCode: mysoftOptionalString(company?.postbox ?? company?.zipCode),
    country: mysoftOptionalString(company?.country ?? company?.countryName) ??
      'Türkiye',
    phoneNumber: mysoftOptionalString(company?.phone) ??
      mysoftOptionalString(userInfo?.phone) ??
      mysoftOptionalString(ctx.phone),
    faxNumber: mysoftOptionalString(company?.fax ?? company?.faxNumber),
    email: mysoftOptionalString(company?.email) ??
      mysoftOptionalString(userInfo?.email),
    webSite: mysoftOptionalString(company?.webSite ?? company?.website),
  }
}

/**
 * getGibAccountModel alias satırı: aliasType 1 = PK (posta kutusu),
 * aliasType 2 = GB (gönderici birim). Silinmemiş, urn: formatlı PK seçilir.
 */
function pickPkAliasFromGibAccount(
  nested: Record<string, unknown>,
): string | undefined {
  const list = nested.gibAccountAliasList
  if (!Array.isArray(list)) return undefined
  const candidates = list
    .filter((row): row is Record<string, unknown> =>
      !!row && typeof row === 'object'
    )
    .filter((row) =>
      row.aliasType === 1 &&
      row.aliasDeleteDate == null &&
      typeof row.alias === 'string' &&
      row.alias.trim().length > 0
    )
    .map((row) => (row.alias as string).trim())
  return candidates.find((a) => a.startsWith('urn:')) ?? candidates[0]
}

export function mapMysoftGibAccount(
  taxId: string,
  payload: unknown,
): RecipientLookupResult | null {
  if (!payload || typeof payload !== 'object') return null
  const row = payload as Record<string, unknown>
  const nested =
    row.data && typeof row.data === 'object'
      ? (row.data as Record<string, unknown>)
      : row

  // GİB'de kayıt yoksa API { data: null, succeed: true } döner → e-Arşiv alıcısı.
  const hasAccount =
    typeof nested.gibAccountName === 'string' ||
    typeof nested.identifierNumber === 'string' ||
    typeof nested.accountName === 'string'
  if (!hasAccount) return null

  const pkAlias = pickPkAliasFromGibAccount(nested) ||
    (typeof nested.pkAlias === 'string' && nested.pkAlias.trim()) ||
    (typeof nested.pk_alias === 'string' && nested.pk_alias.trim()) ||
    undefined

  const name =
    (typeof nested.gibAccountName === 'string' && nested.gibAccountName) ||
    (typeof nested.accountName === 'string' && nested.accountName) ||
    (typeof nested.title === 'string' && nested.title) ||
    (typeof nested.name === 'string' && nested.name) ||
    taxId

  const isEfatura = Boolean(
    pkAlias ||
      typeof nested.eInvoiceStartDate === 'string' ||
      nested.isEInvoiceUser === true ||
      nested.isEFaturaUser === true ||
      nested.eInvoiceUser === true ||
      nested.accountType === 'EFATURA',
  )

  return {
    tax_id: taxId,
    name,
    is_efatura: isEfatura,
    pk_alias: pkAlias,
    tax_office:
      typeof nested.taxOffice === 'string' ? nested.taxOffice : undefined,
    address:
      typeof nested.cityName === 'string'
        ? nested.cityName
        : typeof nested.fullAddress === 'string'
          ? nested.fullAddress
          : undefined,
  }
}
