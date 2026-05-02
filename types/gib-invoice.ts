/** GİB returns field names in Turkish — we accept whatever comes back */
export interface GIBInvoice {
  ettn?: string;
  belgeNumarasi?: string;
  aliciVknTckn?: string;
  aliciUnvanAdSoyad?: string;
  belgeTarihi?: string;
  malhizmetToplamTutari?: string | number;
  vergilerDahilToplamTutar?: string | number;
  onayDurumu?: string;
  [key: string]: unknown;
}
