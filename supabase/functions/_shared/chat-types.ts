export interface ChatAction {
  type:
    | "open_invoices"
    | "open_invoice_detail"
    | "open_invoice_preview"
    | "open_sign_otp"
    | "open_excel_export";
  label: string;
  filter?: {
    startDate: string;
    endDate: string;
    customerName?: string;
    amountGte?: number;
    amountEq?: number;
    direction?: "outgoing" | "incoming";
  };
  invoice?: InvoiceDetailPayload;
  preview?: {
    title: string;
    html?: string;
    pdfBase64?: string;
    uuid?: string;
    draftDate?: string;
    issued?: boolean;
    local_fallback?: boolean;
    direction?: "outgoing" | "incoming";
  };
  sign_otp?: { draftUuid: string; phoneMasked: string };
  excel_export?: {
    download_url: string;
    file_name: string;
    row_count: number;
    expires_in_seconds?: number;
  };
}

export type InvoiceDetailPayload = {
  invoice_uuid: string;
  issue_date: string | null;
  status: string;
  currency: string;
  gross_total: number | null;
  vat_total: number | null;
  net_total: number | null;
  customer_tax_id: string | null;
  customer_name: string | null;
  direction?: "outgoing" | "incoming";
};
