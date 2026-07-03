import type { ChatMessageAction } from "@/types/chat-actions";

import type { InvoiceFactStatus } from "@/types/incoming-invoice";

export type ChatClientAction = {
  type: "confirm_pending_invoice";
  draftUuid: string;
};

export type ChatTurnResponse = {
  message: string;
  conversationId: string;
  action?: ChatMessageAction | null;
};

export type ConversationMessagesResponse = {
  messages: Array<{
    id: string;
    role: string;
    content: string;
    action?: ChatMessageAction | null;
  }>;
};

export type InvoicesListResponse = {
  invoices: unknown[];
  synced?: number;
  error?: string;
};

export type InvoiceDetailResponse = {
  invoice: {
    invoice_uuid: string;
    issue_date: string | null;
    status: InvoiceFactStatus | string;
    currency: string;
    gross_total: number | null;
    vat_total: number | null;
    net_total: number | null;
    customer_tax_id: string | null;
    customer_name: string | null;
  };
};

export type InvoiceHtmlResponse = {
  html?: string;
  pdfBase64?: string;
  local_fallback?: boolean;
};
