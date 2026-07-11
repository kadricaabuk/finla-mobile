import type { CreateInvoiceInput } from '../invoice-mapper.ts'
import type { InvoicePreviewContent } from '../invoice-preview.ts'

export interface InvoiceDraftRef {
  date: string
  uuid: string
  /** Marks which channel (e-Fatura/e-Arşiv) the invoice went through; unused by Mysoft. */
  channel?: 'einvoice' | 'earchive'
}

export interface IncomingInvoiceDetail {
  invoice_uuid: string
  issue_date: string | null
  status: string
  currency: string
  gross_total: number | null
  vat_total: number | null
  net_total: number | null
  customer_tax_id: string | null
  customer_name: string | null
}

/**
 * listOutgoing/IncomingInvoices contract: rows must use GİB's Turkish field
 * names (ettn, belgeNumarasi, belgeTarihi/faturaTarihi "DD/MM/YYYY",
 * onayDurumu, vergilerDahilToplamTutar, malhizmetToplamTutari, paraBirimi,
 * aliciVknTckn/aliciUnvan* (outgoing) or gondericiVknTckn/gondericiUnvan* (incoming)).
 * See mapMysoftHeaderToGibLike / mapMysoftInboxHeaderToGibLike.
 */
export type GibLikeInvoiceRow = Record<string, unknown>

export interface RecipientLookupResult {
  tax_id: string
  name: string
  is_efatura: boolean
  pk_alias?: string
  tax_office?: string
  address?: string
}

export interface InvoiceProviderContext {
  userId: string
  tenantVkn?: string
  phone?: string
}

export interface InvoiceProvider {
  lookupRecipient(
    ctx: InvoiceProviderContext,
    taxId: string,
  ): Promise<RecipientLookupResult | null>
  createInvoicePreview(
    ctx: InvoiceProviderContext,
    input: CreateInvoiceInput,
  ): Promise<{ draft: InvoiceDraftRef; html: string }>
  confirmInvoiceIssue(
    ctx: InvoiceProviderContext,
    draft: InvoiceDraftRef,
    options?: { resendInput?: CreateInvoiceInput },
  ): Promise<{ uuid: string; html: string }>
  /** Deletes the API draft (best-effort; safe since the draft never reached GİB). */
  deleteDraftInvoice(
    ctx: InvoiceProviderContext,
    ettn: string,
  ): Promise<void>
  getInvoicePreview(
    ctx: InvoiceProviderContext,
    params: {
      invoiceUuid: string
      signed: boolean
      draftDate?: string
      direction?: 'outgoing' | 'incoming'
    },
  ): Promise<InvoicePreviewContent>
  listOutgoingInvoices(
    ctx: InvoiceProviderContext,
    startDate: string,
    endDate: string,
  ): Promise<GibLikeInvoiceRow[]>
  listIncomingInvoices(
    ctx: InvoiceProviderContext,
    startDate: string,
    endDate: string,
  ): Promise<GibLikeInvoiceRow[]>
  cancelInvoice(
    ctx: InvoiceProviderContext,
    ettn: string,
    reason: string,
  ): Promise<unknown>
  acceptIncomingInvoice(
    ctx: InvoiceProviderContext,
    ettn: string,
  ): Promise<{ status: string }>
  rejectIncomingInvoice(
    ctx: InvoiceProviderContext,
    ettn: string,
    reason: string,
  ): Promise<{ status: string }>
  getUserProfile(ctx: InvoiceProviderContext): Promise<Record<string, unknown>>
  getIncomingInvoiceDetail(
    ctx: InvoiceProviderContext,
    invoiceUuid: string,
  ): Promise<IncomingInvoiceDetail>
  /** Verifies the tenant's VKN/TCKN is registered/authorized on the provider account. */
  verifyTenantExists(vknTckn: string): Promise<void>
}
