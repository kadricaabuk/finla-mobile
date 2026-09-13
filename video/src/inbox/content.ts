import { z } from "zod";

export const inboxSchema = z.object({
  sellerShort: z.string(),
  sellerLegal: z.string(),
  buyerName: z.string(),
  itemName: z.string(),
  amount: z.number(),
  vatRate: z.number(),
  ettn: z.string(),
  invoiceDate: z.string(),
  slogan: z.string(),
  clock: z.string(),
  notificationTitle: z.string(),
  assistantText: z.string(),
  successText: z.string(),
});

export type InboxContent = z.infer<typeof inboxSchema>;

export const defaultInboxContent: InboxContent = {
  sellerShort: "Nova Medya",
  sellerLegal: "NOVA MEDYA REKLAM VE İLETİŞİM A.Ş.",
  buyerName: "Yılmaz İnşaat",
  itemName: "Hizmet",
  amount: 10000,
  vatRate: 20,
  ettn: "3a1d438b-0273-44eb-acb4-77d8c45f967a",
  invoiceDate: "12-09-2026",
  slogan: "Muhasebenin yeni dili.",
  clock: "14:24",
  notificationTitle: "Gelen faturanız var.",
  assistantText:
    "Nova Medya'dan 12.000,00 ₺ tutarında gelen faturan var. Önizlemeyi açıp onaylayabilirsin.",
  successText: "Fatura onaylandı.",
};

export const THINKING_STEPS = [
  "Gelen faturalar aranıyor…",
  "Fatura bulunuyor…",
  "Önizleme hazırlanıyor…",
] as const;

const tl = new Intl.NumberFormat("tr-TR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const money = (value: number) => `${tl.format(value)} ₺`;

export const grossTotal = (amount: number, vatRate: number) =>
  amount + (amount * vatRate) / 100;
