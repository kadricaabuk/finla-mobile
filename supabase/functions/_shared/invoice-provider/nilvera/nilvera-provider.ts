import { sha256Hex } from '../../crypto.ts'
import { buildLocalDraftPreviewHtml } from '../../invoice-mapper.ts'
import type { InvoicePreviewContent } from '../../invoice-preview.ts'
import type {
  GibLikeInvoiceRow,
  IncomingInvoiceDetail,
  InvoiceDraftRef,
  InvoiceProvider,
  InvoiceProviderContext,
  RecipientLookupResult,
} from '../types.ts'
import { createNilveraClient, type NilveraClient } from './nilvera-client.ts'
import {
  buildNilveraInvoiceModel,
  mapNilveraCompanyToProfile,
  mapNilveraIncomingStatus,
  mapNilveraPurchaseToGibLike,
  mapNilveraRecipient,
  mapNilveraSaleToGibLike,
  type NilveraCompanyInfo,
} from './nilvera-mapper.ts'

export interface NilveraProviderConfig {
  apiKey: string
  environment: 'test' | 'prod'
}

type Channel = 'einvoice' | 'earchive'

function requireTenantVkn(ctx: InvoiceProviderContext): string {
  const vkn = ctx.tenantVkn?.trim()
  if (!vkn) {
    throw new Error(
      'Fatura işlemi için firma VKN/TCKN bağlanmalı. Profilden VKN ekle.',
    )
  }
  return vkn
}

/** DD/MM/YYYY (TR) → ISO date (for Nilvera's StartDate/EndDate params). */
function trDateToIsoDate(trDate: string): string {
  const m = trDate.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) throw new Error('Tarih formatı GG/AA/YYYY olmalıdır.')
  return `${m[3]}-${m[2]}-${m[1]}`
}

interface NilveraPage<T> {
  Content?: T[]
  TotalPages?: number
}

const LIST_PAGE_SIZE = 200
const LIST_PAGE_CAP = 50

async function fetchAllPages(
  client: NilveraClient,
  path: string,
  startDate: string,
  endDate: string,
): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = []
  for (let page = 1; page <= LIST_PAGE_CAP; page++) {
    const result = await client.request<NilveraPage<Record<string, unknown>>>(path, {
      method: 'GET',
      query: {
        Page: page,
        PageSize: LIST_PAGE_SIZE,
        StartDate: startDate,
        EndDate: endDate,
        DateFilterType: 'IssueDate',
      },
    })
    const rows = result?.Content ?? []
    all.push(...rows)
    if (rows.length === 0) break
    const totalPages = result?.TotalPages ?? page
    if (page >= totalPages) break
  }
  return all
}

/**
 * GET /general/Company field names are unverified (see the note above
 * mapNilveraCompanyToProfile in nilvera-mapper.ts). Confirm before going live.
 */
async function fetchCompanyInfo(client: NilveraClient): Promise<Record<string, unknown>> {
  const payload = await client.request<Record<string, unknown>>('/general/Company', {
    method: 'GET',
  })
  return payload ?? {}
}

function companyInfoForModel(company: Record<string, unknown>): NilveraCompanyInfo {
  return {
    name: typeof company.Name === 'string' ? company.Name : undefined,
    taxOffice: typeof company.TaxOffice === 'string' ? company.TaxOffice : undefined,
    address: typeof company.Address === 'string' ? company.Address : undefined,
    district: typeof company.District === 'string' ? company.District : undefined,
    city: typeof company.City === 'string' ? company.City : undefined,
    country: typeof company.Country === 'string' ? company.Country : undefined,
    postalCode: typeof company.PostalCode === 'string' ? company.PostalCode : undefined,
    phone: typeof company.Phone === 'string' ? company.Phone : undefined,
    mail: typeof company.Mail === 'string' ? company.Mail : undefined,
    webSite: typeof company.WebSite === 'string' ? company.WebSite : undefined,
  }
}

async function fetchInvoiceHtml(
  client: NilveraClient,
  resource: 'Sale' | 'Purchase',
  channel: Channel,
  uuid: string,
): Promise<InvoicePreviewContent | null> {
  const base = channel === 'einvoice' ? '/einvoice' : '/earchive'
  try {
    const html = await client.getText(`${base}/${resource}/${uuid}/html`)
    if (html) return { html }
  } catch {
    // fall through: try PDF instead
  }
  try {
    const bytes = await client.getBinary(`${base}/${resource}/${uuid}/pdf`)
    const pdfBase64 = btoa(String.fromCharCode(...bytes))
    return { pdfBase64 }
  } catch {
    return null
  }
}

export function createNilveraProvider(config: NilveraProviderConfig): InvoiceProvider {
  const client = createNilveraClient({ apiKey: config.apiKey })

  return {
    async lookupRecipient(_ctx, taxId) {
      const id = taxId.replace(/\s/g, '')
      if (!/^\d{10,11}$/.test(id)) return null
      const rows = await client.request<Record<string, unknown>[]>(
        '/general/GlobalCompany/Check/TaxNumber/' + encodeURIComponent(id),
        { method: 'GET' },
      )
      return mapNilveraRecipient(id, Array.isArray(rows) ? rows : [])
    },

    async createInvoicePreview(ctx, input) {
      const tenantVkn = requireTenantVkn(ctx)
      const recipient: RecipientLookupResult | null = input.buyerTaxId
        ? await this.lookupRecipient(ctx, input.buyerTaxId)
        : null

      const foreignBuyer = input.buyerCountry
        ? input.buyerCountry.trim().toLocaleLowerCase('tr-TR') !== 'türkiye'
        : false
      const channel: Channel = recipient?.is_efatura && !foreignBuyer ? 'einvoice' : 'earchive'
      const base = channel === 'einvoice' ? '/einvoice' : '/earchive'

      const company = await fetchCompanyInfo(client)
      const body = buildNilveraInvoiceModel(
        input,
        tenantVkn,
        recipient,
        companyInfoForModel(company),
      )

      const created = await client.request<{ UUID: string; InvoiceNumber?: string }>(
        `${base}/Draft/Create`,
        { method: 'POST', body },
      )
      if (!created?.UUID) {
        throw new Error('Taslak oluşturuldu ancak UUID dönmedi.')
      }

      const draft: InvoiceDraftRef = {
        uuid: created.UUID,
        date: input.date ?? '',
        channel,
      }

      const preview = await fetchInvoiceHtml(client, 'Sale', channel, created.UUID)
      const html = preview?.html ?? buildLocalDraftPreviewHtml({
        buyer_name: input.buyerName,
        buyer_tax_id: input.buyerTaxId,
        date: input.date,
        due_date: input.dueDate,
        note: input.note,
        currency: input.currency,
        items: input.items.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          unit: i.unit,
          unit_price: i.unitPrice,
          vat_rate: i.vatRate,
          discount_rate: i.discountRate,
          discount_amount: i.discountAmount,
        })),
      })

      return { draft, html }
    },

    async confirmInvoiceIssue(_ctx, draft) {
      const channel: Channel = draft.channel ?? 'einvoice'
      const base = channel === 'einvoice' ? '/einvoice' : '/earchive'

      await client.request<string[]>(`${base}/Draft/ConfirmAndSend`, {
        method: 'POST',
        body: [{ UUID: draft.uuid }],
      })

      const preview = await fetchInvoiceHtml(client, 'Sale', channel, draft.uuid)
      const html = preview?.html ??
        `<!DOCTYPE html><html><body><h1>Fatura GİB'e gönderildi</h1><p>ETTN: ${draft.uuid}</p></body></html>`

      return { uuid: draft.uuid, html }
    },

    async deleteDraftInvoice(_ctx, ettn) {
      // No confirmed draft-delete endpoint found for Nilvera; best-effort no-op.
      console.warn(JSON.stringify({
        event: 'nilvera_delete_draft_unsupported',
        ettn,
      }))
    },

    async getInvoicePreview(_ctx, params) {
      const direction = params.direction ?? 'outgoing'
      const resource = direction === 'incoming' ? 'Purchase' : 'Sale'
      for (const channel of ['einvoice', 'earchive'] as Channel[]) {
        const preview = await fetchInvoiceHtml(client, resource, channel, params.invoiceUuid)
        if (preview) return preview
        if (direction === 'incoming') break // Purchase only exists under einvoice.
      }
      throw new Error('Fatura önizlemesi hazırlanamadı.')
    },

    async listOutgoingInvoices(ctx, startDate, endDate) {
      requireTenantVkn(ctx)
      const start = trDateToIsoDate(startDate)
      const end = trDateToIsoDate(endDate)

      const einvoiceRows = await fetchAllPages(client, '/einvoice/Sale', start, end)
      let earchiveRows: Record<string, unknown>[] = []
      try {
        earchiveRows = await fetchAllPages(client, '/earchive/Sale', start, end)
      } catch (err) {
        console.warn(JSON.stringify({
          event: 'nilvera_earchive_sale_list_failed',
          error: err instanceof Error ? err.message : String(err),
        }))
      }

      const mapped: GibLikeInvoiceRow[] = [
        ...einvoiceRows.map((r) => mapNilveraSaleToGibLike(r, 'einvoice')),
        ...earchiveRows.map((r) => mapNilveraSaleToGibLike(r, 'earchive')),
      ]
      return mapped
    },

    async listIncomingInvoices(ctx, startDate, endDate) {
      requireTenantVkn(ctx)
      const start = trDateToIsoDate(startDate)
      const end = trDateToIsoDate(endDate)
      const rows = await fetchAllPages(client, '/einvoice/Purchase', start, end)
      return rows.map(mapNilveraPurchaseToGibLike)
    },

    async cancelInvoice(_ctx, ettn, reason) {
      // Endpoint not fully confirmed from Nilvera's docs (inferred from the
      // REST pattern only); verify against swagger before going live.
      const cancelDate = new Date().toISOString().slice(0, 10)
      return await client.request<unknown>('/earchive/Sale/Cancel', {
        method: 'POST',
        body: { UUID: ettn, CancelDate: cancelDate, CancelNote: reason },
      })
    },

    async acceptIncomingInvoice(_ctx, ettn) {
      const detail = await client.request<{ InvoiceProfile?: string }>(
        `/einvoice/Purchase/${ettn}/Details`,
        { method: 'GET' },
      )
      if (detail?.InvoiceProfile === 'TEMELFATURA') {
        throw new Error(
          'Temel fatura otomatik kabul edilir; ayrıca kabul işlemi gerekmez.',
        )
      }
      await client.request<unknown>('/einvoice/Purchase/SendAnswer', {
        method: 'POST',
        body: { UUID: ettn, AnswerCode: 'approved' },
      })
      return { status: 'accepted' }
    },

    async rejectIncomingInvoice(_ctx, ettn, reason) {
      const rejectReason = reason.trim()
      if (rejectReason.length < 3) {
        throw new Error('Red sebebi en az 3 karakter olmalıdır.')
      }
      const detail = await client.request<{ InvoiceProfile?: string }>(
        `/einvoice/Purchase/${ettn}/Details`,
        { method: 'GET' },
      )
      if (detail?.InvoiceProfile === 'TEMELFATURA') {
        throw new Error('Temel fatura yanıtlanamaz; yalnızca ticari faturalara KABUL/RED gönderilebilir.')
      }
      await client.request<unknown>('/einvoice/Purchase/SendAnswer', {
        method: 'POST',
        body: { UUID: ettn, AnswerCode: 'rejected', RejectNote: rejectReason },
      })
      return { status: 'rejected' }
    },

    async getUserProfile(ctx) {
      const company = await fetchCompanyInfo(client)
      return mapNilveraCompanyToProfile(company, ctx)
    },

    async getIncomingInvoiceDetail(_ctx, invoiceUuid): Promise<IncomingInvoiceDetail> {
      const detail = await client.request<Record<string, unknown>>(
        `/einvoice/Purchase/${invoiceUuid}/Details`,
        { method: 'GET' },
      )
      const gross = typeof detail.InvoiceAmount === 'number' ? detail.InvoiceAmount : null
      const vat = typeof detail.TaxAmount === 'number' ? detail.TaxAmount : null
      const net = gross !== null && vat !== null ? gross - vat : null
      const issueDate = typeof detail.IssueDate === 'string' ? detail.IssueDate.slice(0, 10) : null

      return {
        invoice_uuid: invoiceUuid,
        issue_date: issueDate,
        status: mapNilveraIncomingStatus(detail.AnswerCode, detail.StatusCode ?? null),
        currency: typeof detail.CurrencyCode === 'string' ? detail.CurrencyCode : 'TRY',
        gross_total: gross,
        vat_total: vat,
        net_total: net,
        // The Details endpoint doesn't return sender name/VKN (not in the
        // confirmed schema); expected to be backfilled from the list sync
        // (invoice_facts) instead.
        customer_tax_id: null,
        customer_name: null,
      }
    },

    async verifyTenantExists(vknTckn) {
      const company = await fetchCompanyInfo(client)
      const companyTaxNumber = typeof company.TaxNumber === 'string' ? company.TaxNumber : ''
      if (companyTaxNumber.trim() !== vknTckn.trim()) {
        throw new Error(
          'Bu VKN/TCKN, bağlı Nilvera hesabıyla eşleşmiyor. Firma bilgisini kontrol et.',
        )
      }
    },
  }
}

const instanceCache = new Map<string, InvoiceProvider>()

export async function getNilveraProvider(
  config: NilveraProviderConfig,
): Promise<InvoiceProvider> {
  const key = await sha256Hex(`${config.environment}:${config.apiKey}`)
  const cached = instanceCache.get(key)
  if (cached) return cached
  const provider = createNilveraProvider(config)
  instanceCache.set(key, provider)
  return provider
}
