import {
  assert,
  assertEquals,
  assertFalse,
} from "jsr:@std/assert";
import {
  isAnalysisQuestion,
  isBareInvoiceShowIntent,
  isConfirmLikeMessage,
  isCustomerClarificationIntent,
  isExcelExportIntent,
  isFinancialTotalsIntent,
  isIncomingInvoiceListIntent,
  isLikelyInvoiceCustomerName,
  parseFiltersFromText,
  parseFinancialDirection,
  parseInvoiceDirectionFromMessage,
} from "./intents.ts";

Deno.test("isExcelExportIntent — excel indir", () => {
  assert(isExcelExportIntent("excel indir"));
  assert(isExcelExportIntent("faturaları excel olarak indir"));
  assert(isExcelExportIntent("xlsx aktar"));
});

Deno.test("isExcelExportIntent — rapor oluştur", () => {
  assert(isExcelExportIntent("Bir rapor oluştur"));
  assert(isExcelExportIntent("rapor hazırla"));
  assertFalse(isExcelExportIntent("rapor et"));
});

Deno.test("isBareInvoiceShowIntent — excel indir preview değil", () => {
  assertFalse(isBareInvoiceShowIntent("excel indir"));
});

Deno.test("isBareInvoiceShowIntent — pdf indir hâlâ preview", () => {
  assert(isBareInvoiceShowIntent("pdf indir"));
});

Deno.test("isCustomerClarificationIntent — komut kelimeleri reddedilir", () => {
  assertFalse(isCustomerClarificationIntent("Tamam oldu"));
  assertFalse(isCustomerClarificationIntent("peki anladım"));
  assertFalse(isCustomerClarificationIntent("evet olur"));
});

Deno.test("isCustomerClarificationIntent — gerçek müşteri adı kabul", () => {
  assert(isCustomerClarificationIntent("Ege Durmaz"));
});

Deno.test("isCustomerClarificationIntent — rapor komutu reddedilir", () => {
  assertFalse(isCustomerClarificationIntent("Bir rapor oluştur"));
});

Deno.test("parseFiltersFromText — rapor komutu müşteri adı sayılmaz", () => {
  const filters = parseFiltersFromText("Bir rapor oluştur");
  assertEquals(filters.customerName, undefined);
});

Deno.test("isLikelyInvoiceCustomerName — tarih ifadeleri reddedilir", () => {
  assertFalse(isLikelyInvoiceCustomerName("Bu ayki"));
  assertFalse(isLikelyInvoiceCustomerName("Geçen ayki"));
  assertFalse(isLikelyInvoiceCustomerName("bu ay"));
});

Deno.test("parseFiltersFromText — bu ayki müşteri adı sayılmaz", () => {
  const filters = parseFiltersFromText("Bu ayki gelen faturaları göster");
  assertEquals(filters.customerName, undefined);
});

Deno.test("parseFiltersFromText — fromVendor customerMatch ile ezilmez", () => {
  const filters = parseFiltersFromText(
    "XYZ firmasından gelen Ahmet beye yazılan fatura",
  );
  assertEquals(filters.customerName, "XYZ");
});

Deno.test("isConfirmLikeMessage — onay ifadeleri", () => {
  assert(isConfirmLikeMessage("onaylıyorum"));
  assert(isConfirmLikeMessage("evet"));
  assert(isConfirmLikeMessage("onayla"));
  assertFalse(isConfirmLikeMessage("evet faturayı göster"));
});

Deno.test("isFinancialTotalsIntent — gider/gelir", () => {
  assert(isFinancialTotalsIntent("bu ay ne kadar harcadım"));
  assert(isFinancialTotalsIntent("aylık gelir özeti"));
  assertFalse(isFinancialTotalsIntent("gelen faturaları listele"));
});

Deno.test("parseFinancialDirection", () => {
  assertEquals(parseFinancialDirection("bu ay giderlerim"), "incoming");
  assertEquals(parseFinancialDirection("kazancım ne"), "outgoing");
  assertEquals(parseFinancialDirection("gider ve gelir özeti"), "both");
});

Deno.test("parseInvoiceDirectionFromMessage", () => {
  assertEquals(
    parseInvoiceDirectionFromMessage("gelen faturaları getir"),
    "incoming",
  );
  assertEquals(
    parseInvoiceDirectionFromMessage("kestiğim faturalar"),
    "outgoing",
  );
  assertEquals(parseInvoiceDirectionFromMessage("faturaları listele"), null);
});

Deno.test("isIncomingInvoiceListIntent — finansal toplam değil", () => {
  assert(isIncomingInvoiceListIntent("gelen faturaları göster"));
  assertFalse(isIncomingInvoiceListIntent("bu ay ne kadar borcum var"));
});

Deno.test("isFinancialTotalsIntent — vergi soruları fast-path'e girmez", () => {
  assertFalse(isFinancialTotalsIntent("geçen çeyrekteki gelir vergim?"));
  assertFalse(isFinancialTotalsIntent("gelir vergisi?"));
  assertFalse(isFinancialTotalsIntent("muhtasar?"));
  assertFalse(isFinancialTotalsIntent("geçen çeyrekten devreden KDV tutarı ne?"));
  assert(isFinancialTotalsIntent("geçen çeyrek ne kadar kazandım"));
});

Deno.test("isAnalysisQuestion — yorum isteyen sorular", () => {
  assert(
    isAnalysisQuestion(
      "bu ayki gelen giden faturalarıma baktığında mali durumumu nasıl yorumluyorsun?",
    ),
  );
  assert(isAnalysisQuestion("sence ne kadar kar ettim"));
  assertFalse(isAnalysisQuestion("bu ay ne kadar kazandım"));
});

Deno.test("isFinancialTotalsIntent — yorum sorusu fast-path'e girmez", () => {
  assertFalse(isFinancialTotalsIntent("sence ne kadar kar ettim"));
  assertFalse(
    isIncomingInvoiceListIntent(
      "gelen faturalarıma baktığında mali durumumu nasıl yorumluyorsun?",
    ),
  );
});
