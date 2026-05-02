export interface ChatMessageAction {
  type:
    | "open_invoices"
    | "open_invoice_detail"
    | "open_invoice_preview"
    | "open_sign_otp";
  label: string;
  filter?: {
    startDate: string;
    endDate: string;
    customerName?: string;
    amountGte?: number;
    amountEq?: number;
  };
  invoice?: InvoiceDetailPayload;
  preview?: {
    title: string;
    html: string;
    uuid?: string;
  };
  sign_otp?: {
    draftUuid: string;
    phoneMasked: string;
  };
}

export interface InvoiceDetailPayload {
  invoice_uuid: string;
  issue_date: string | null;
  status: string;
  currency: string;
  gross_total: number | null;
  vat_total: number | null;
  net_total: number | null;
  customer_tax_id: string | null;
  customer_name: string | null;
}

export interface ChatMessage {
  id: string;
  text: string;
  role: "user" | "assistant";
  action?: ChatMessageAction;
}

export type InvoiceDetail = InvoiceDetailPayload;
