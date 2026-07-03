/** Liste satırı `onayDurumu` — portal ile hizalı. */
export type IncomingInvoiceDisplayStatus =
  | "Yanıt Bekleniyor"
  | "Kabul Kuyruğunda"
  | "Red Kuyruğunda"
  | "Kabul"
  | "Red"
  | "İptal";

/** `invoice-detail` / `invoice_facts` — gelen fatura. */
export type IncomingInvoiceFactStatus =
  | "pending_response"
  | "accepted"
  | "rejected"
  | "cancelled"
  | "unknown";

/** Giden fatura fact status (mevcut). */
export type OutgoingInvoiceFactStatus =
  | "approved"
  | "draft"
  | "cancelled"
  | "unknown";

export type InvoiceFactStatus =
  | IncomingInvoiceFactStatus
  | OutgoingInvoiceFactStatus;
