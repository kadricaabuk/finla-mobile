export interface ChatAction {
  type: 'open_invoices' | 'open_invoice_detail' | 'open_invoice_preview' | 'open_sign_otp'
  label: string
  filter?: {
    startDate: string
    endDate: string
    customerName?: string
    amountGte?: number
    amountEq?: number
  }
  invoice?: InvoiceDetailPayload
  preview?: { title: string; html?: string; uuid?: string; issued?: boolean }
  sign_otp?: { draftUuid: string; phoneMasked: string }
}

export interface InvoiceSearchFilters {
  customerName?: string
  amountGte?: number
  amountEq?: number
}

export type InvoiceDetailPayload = {
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

export interface PendingInvoiceState {
  draft?: { date?: string; uuid?: string }
  request?: {
    buyer_name?: string
    buyer_tax_id?: string
    items?: { quantity?: number; unit_price?: number; vat_rate?: number }[]
    currency?: string
    date?: string
  }
  preview_html?: string
  signing?: {
    status?: 'idle' | 'otp_sent' | 'otp_verified'
    phone?: string
    phone_masked?: string
    operation_id?: string
    otp_requested_at?: string
    otp_verified_at?: string
  }
}

export interface ToolContext {
  username: string
  conversationId: string
  userMessage: string
  filters: InvoiceSearchFilters
}
