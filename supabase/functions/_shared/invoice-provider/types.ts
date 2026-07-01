import type { CreateInvoiceInput } from '../invoice-mapper.ts'
import type { InvoicePreviewContent } from '../invoice-preview.ts'

export interface InvoiceDraftRef {
  date: string
  uuid: string
}

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
  ): Promise<unknown[]>
  listIncomingInvoices(
    ctx: InvoiceProviderContext,
    startDate: string,
    endDate: string,
  ): Promise<unknown[]>
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
}
