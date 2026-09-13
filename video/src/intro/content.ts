import { z } from "zod";

/**
 * Everything the video says out loud. Exposed as a Remotion schema so the
 * copy can be tweaked in the Studio sidebar without touching components.
 */
export const introSchema = z.object({
  customerName: z.string(),
  itemName: z.string(),
  promptText: z.string(),
  amount: z.number(),
  vatRate: z.number(),
  ettn: z.string(),
  slogan: z.string(),
  clock: z.string(),
  // Identity shown on the e-Arsiv document in the preview sheet. The layout and
  // field set follow a real draft rendered by the app; the company is fictional.
  sellerName: z.string(),
  sellerAddress: z.string(),
  sellerPhone: z.string(),
  sellerWeb: z.string(),
  sellerEmail: z.string(),
  sellerTaxOffice: z.string(),
  sellerVkn: z.string(),
  sellerMersis: z.string(),
  sellerTradeReg: z.string(),
  buyerLegalName: z.string(),
  buyerAddress: z.string(),
  buyerTckn: z.string(),
  /** A draft has no invoice number yet — it is assigned when GIB accepts it. */
  invoiceNo: z.string(),
  invoiceDate: z.string(),
});

export type IntroContent = z.infer<typeof introSchema>;

export const defaultContent: IntroContent = {
  customerName: "Yılmaz İnşaat",
  itemName: "İşçilik",
  promptText: "Yılmaz İnşaat'a 10.000₺ + KDV işçilik faturası kes.",
  amount: 10000,
  vatRate: 20,
  ettn: "3A1D438B-0273-44EB-ACB4-77D8C45F967A",
  slogan: "Muhasebenin yeni dili.",
  clock: "09:13",
  sellerName: "Nova Medya Reklam ve İletişim A.Ş.",
  sellerAddress:
    "Barbaros Mah. Ihlamur Sok. No:12 /1C Blok Adı:A Blok Kapı No:4\nATAŞEHİR / İSTANBUL / TÜRKİYE",
  sellerPhone: "Tel: +902163810214 Fax: +902163810215",
  sellerWeb: "novamedya.com.tr",
  sellerEmail: "info@novamedya.com.tr",
  sellerTaxOffice: "Ataşehir Vergi Dairesi Müdürlüğü",
  sellerVkn: "1234567890",
  sellerMersis: "0001151923200015",
  sellerTradeReg: "25F",
  buyerLegalName: "Yılmaz İnşaat",
  buyerAddress: "Merkez / İstanbul / TÜRKİYE",
  buyerTckn: "10766622460",
  invoiceNo: "",
  invoiceDate: "12-09-2026 08:16",
};

const tl = new Intl.NumberFormat("tr-TR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const money = (value: number) => `${tl.format(value)} ₺`;

/** The document writes amounts the way the e-Arsiv template does: "10.000,00TL". */
export const moneyTl = (value: number) => `${tl.format(value)}TL`;

/** Unit price is printed without trailing zeros on the template: "10.000TL". */
const plain = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 });
export const unitPriceTl = (value: number) => `${plain.format(value)}TL`;

/** Status labels come verbatim from use-chat-stream-display.ts. */
export const THINKING_STEPS = [
  "Alıcı bilgileri araştırılıyor…",
  "Faturalar araştırılıyor…",
  "Taslak fatura hazırlanıyor…",
] as const;

/** Example prompts as rendered by use-example-prompts.ts. */
export const EXAMPLE_PROMPTS = [
  { icon: "document", text: "Yılmaz İnşaat'a 10.000 TL + KDV fatura kes" },
  { icon: "albums", text: "Bu ay kestiğim faturaları göster" },
  { icon: "mail", text: "Gelen son faturaları listele" },
  { icon: "download", text: "Geçen ayın faturalarını Excel'e dök" },
] as const;

export const ASSISTANT_TEXT =
  "Taslak hazır, önizlemeyi kontrol edebilirsin. Uygunsa GİB'e gönderebilirsin.";
