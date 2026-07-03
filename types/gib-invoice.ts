import type { IncomingInvoiceDisplayStatus } from "@/types/incoming-invoice";

/** Liste modu: kesilen (outgoing) vs adıma kesilen gelen (incoming). */
export type InvoiceListDirection = "outgoing" | "incoming";

/** GİB returns field names in Turkish — we accept whatever comes back */
export interface GIBInvoice {
  ettn?: string;
  belgeNumarasi?: string;
  /** Gelen fatura (bana kesilen) — faturayı düzenleyen taraf */
  gondericiUnvanAdSoyad?: string;
  gondericiUnvan?: string;
  gondericiVknTckn?: string;
  aliciVknTckn?: string;
  aliciUnvanAdSoyad?: string;
  belgeTarihi?: string;
  malhizmetToplamTutari?: string | number;
  vergilerDahilToplamTutar?: string | number;
  /** Gelen listede portal hizalı: Yanıt Bekleniyor | Kabul | Red | İptal */
  onayDurumu?: IncomingInvoiceDisplayStatus | string;
  [key: string]: unknown;
}
