import {
  assert,
  assertAlmostEquals,
  assertEquals,
  assertThrows,
} from "jsr:@std/assert";
import {
  TEVKIFAT_CODES,
  validateInvoiceTaxFields,
} from "../_shared/gib-tax-codes.ts";
import {
  buildMysoftInvoiceOutboxBody,
  isForeignBuyerCountry,
  mapMysoftGibAccount,
} from "../_shared/mysoft-mapper.ts";
import type { CreateInvoiceInput } from "../_shared/invoice-mapper.ts";

function baseInput(overrides: Partial<CreateInvoiceInput> = {}): CreateInvoiceInput {
  return {
    buyerName: "Test Alıcı A.Ş.",
    buyerTaxId: "6271036106",
    items: [
      {
        name: "Danışmanlık hizmeti",
        quantity: 1,
        unit: "adet",
        unitPrice: 10000,
        vatRate: 20,
      },
    ],
    date: "01/06/2026",
    currency: "TRY",
    ...overrides,
  };
}

Deno.test("validateInvoiceTaxFields — KDV %0 istisna kodu zorunlu", () => {
  assertThrows(
    () => validateInvoiceTaxFields([{ vatRate: 0 }]),
    Error,
    "istisna kodu zorunlu",
  );
});

Deno.test("validateInvoiceTaxFields — bilinmeyen kodlar reddedilir", () => {
  assertThrows(
    () => validateInvoiceTaxFields([{ vatRate: 0, vatExemptionCode: "999" }]),
    Error,
    "Bilinmeyen KDV istisna kodu",
  );
  assertThrows(
    () => validateInvoiceTaxFields([{ vatRate: 20, withholdingCode: "999" }]),
    Error,
    "Bilinmeyen tevkifat kodu",
  );
});

Deno.test("validateInvoiceTaxFields — KDV %0 satıra tevkifat olmaz", () => {
  assertThrows(
    () =>
      validateInvoiceTaxFields([
        { vatRate: 0, vatExemptionCode: "302", withholdingCode: "602" },
      ]),
    Error,
  );
});

Deno.test("validateInvoiceTaxFields — istisnalı + KDV'li karışım engellenir", () => {
  assertThrows(
    () =>
      validateInvoiceTaxFields([
        { vatRate: 0, vatExemptionCode: "302" },
        { vatRate: 20 },
      ]),
    Error,
    "karıştırılamıyor",
  );
});

Deno.test("validateInvoiceTaxFields — mal ihracatı (301) yönlendirilir", () => {
  assertThrows(
    () => validateInvoiceTaxFields([{ vatRate: 0, vatExemptionCode: "301" }]),
    Error,
    "Mal ihracatı",
  );
});

Deno.test("tevkifat tablosu — bilinen oranlar doğru", () => {
  assertEquals(TEVKIFAT_CODES["601"].numerator, 4); // yapım işleri 4/10
  assertEquals(TEVKIFAT_CODES["602"].numerator, 9); // danışmanlık 9/10
  assertEquals(TEVKIFAT_CODES["624"].numerator, 2); // yük taşımacılığı 2/10
  assertEquals(TEVKIFAT_CODES["625"].numerator, 3); // ticari reklam 3/10
  assertEquals(TEVKIFAT_CODES["627"].numerator, 5); // demir-çelik 5/10
});

Deno.test("buildMysoftInvoiceOutboxBody — tevkifat KDV üzerinden hesaplanır", () => {
  const body = buildMysoftInvoiceOutboxBody(
    baseInput({
      items: [
        {
          name: "Danışmanlık",
          quantity: 1,
          unit: "adet",
          unitPrice: 16666.67,
          vatRate: 20,
          withholdingCode: "602", // 9/10
        },
      ],
    }),
    "1234567890",
    null,
    { isSaveAsDraft: true },
  );

  assertEquals(body.invoiceType, "TEVKIFAT");
  const detail = (body.invoiceDetail as Record<string, unknown>[])[0];
  const vat = 3333.33; // 16.666,67 × %20 → 3.333,334 ≈ 3.333,33
  assertAlmostEquals(Number(detail.amtVatTra), vat, 0.01);
  // Tevkifat NET tutardan değil KDV'den: 3.333,33 × 9/10 = 3.000,00
  assertAlmostEquals(Number(detail.withholdingTaxAmount), 3000, 0.01);
  assertEquals(detail.withholdingTaxPercentage, 90);
  assertAlmostEquals(Number(detail.withholdingTaxableAmount), vat, 0.01);

  const calc = body.invoiceCalculation as Record<string, number>;
  // Ödenecek = brüt − tevkifat = 20.000,00 − 3.000,00
  assertAlmostEquals(calc.taxInclusiveAmount, 20000, 0.01);
  assertAlmostEquals(calc.payableAmount, 17000, 0.01);
});

Deno.test("buildMysoftInvoiceOutboxBody — hizmet ihracatı (302, yurt dışı)", () => {
  const body = buildMysoftInvoiceOutboxBody(
    baseInput({
      buyerTaxId: undefined,
      buyerCountry: "Almanya",
      buyerCity: "Berlin",
      currency: "EUR",
      currencyRate: "48.50",
      items: [
        {
          name: "Yazılım geliştirme hizmeti",
          quantity: 1,
          unit: "adet",
          unitPrice: 5000,
          vatRate: 0,
          vatExemptionCode: "302",
        },
      ],
    }),
    "1234567890",
    null,
    { isSaveAsDraft: true },
  );

  assertEquals(body.invoiceType, "ISTISNA");
  assertEquals(body.eDocumentType, "EARSIVFATURA");
  assertEquals(body.profile, "EARSIVFATURA");
  assertEquals(body.currencyRate, "48.50");
  const account = body.invoiceAccount as Record<string, unknown>;
  assertEquals(account.vknTckn, "2222222222");
  assertEquals(account.countryName, "Almanya");
  assertEquals(account.cityName, "Berlin");
  const detail = (body.invoiceDetail as Record<string, unknown>[])[0];
  assertEquals(detail.taxExemptionReasonCode, "302");
  assertEquals(String(detail.amtVatTra), "0.00");
  const sub = (body.tax as { taxSubTotal: Record<string, unknown>[] }[])[0]
    .taxSubTotal[0];
  assertEquals(sub.taxExemptionReasonCode, "302");
  assertEquals(sub.taxAmount, 0);
});

Deno.test("buildMysoftInvoiceOutboxBody — dövizli faturada kur zorunlu", () => {
  assertThrows(
    () =>
      buildMysoftInvoiceOutboxBody(
        baseInput({ currency: "USD", currencyRate: undefined }),
        "1234567890",
        null,
        { isSaveAsDraft: true },
      ),
    Error,
    "kur zorunlu",
  );
});

Deno.test("buildMysoftInvoiceOutboxBody — yurt içi alıcıda VKN zorunlu", () => {
  assertThrows(
    () =>
      buildMysoftInvoiceOutboxBody(
        baseInput({ buyerTaxId: undefined }),
        "1234567890",
        null,
        { isSaveAsDraft: true },
      ),
    Error,
    "VKN/TCKN",
  );
});

Deno.test("buildMysoftInvoiceOutboxBody — normal satış SATIS + e-Arşiv profili", () => {
  const body = buildMysoftInvoiceOutboxBody(
    baseInput(),
    "1234567890",
    null,
    { isSaveAsDraft: true },
  );
  assertEquals(body.invoiceType, "SATIS");
  assertEquals(body.profile, "EARSIVFATURA");
  const calc = body.invoiceCalculation as Record<string, number>;
  assertAlmostEquals(calc.payableAmount, 12000, 0.01); // 10.000 + %20 KDV
});

Deno.test("buildMysoftInvoiceOutboxBody — tevkifatlı e-Fatura TİCARİFATURA olur", () => {
  // GİB kuralı: tevkifatlı e-Faturada alıcının red hakkı olmalı (sandbox doğrulandı).
  const body = buildMysoftInvoiceOutboxBody(
    baseInput({
      items: [
        {
          name: "Danışmanlık",
          quantity: 1,
          unit: "adet",
          unitPrice: 10000,
          vatRate: 20,
          withholdingCode: "602",
        },
      ],
    }),
    "1234567890",
    {
      tax_id: "6271036106",
      name: "MYSOFT TEST",
      is_efatura: true,
      pk_alias: "urn:mail:adpk@ds.com",
    },
    { isSaveAsDraft: true },
  );
  assertEquals(body.eDocumentType, "EFATURA");
  assertEquals(body.invoiceType, "TEVKIFAT");
  assertEquals(body.profile, "TICARIFATURA");
  assertEquals(body.pkAlias, "urn:mail:adpk@ds.com");
});

Deno.test("mapMysoftGibAccount — gibAccountAliasList'ten PK seçer", () => {
  // Gerçek sandbox yanıt şekli: aliasType 1 = PK, 2 = GB.
  const recipient = mapMysoftGibAccount("6271036106", {
    gibAccountName: "MYSOFT TEST",
    identifierNumber: "6271036106",
    eInvoiceStartDate: "2019-10-18T11:51:26+03:00",
    gibAccountAliasList: [
      { alias: "urn:mail:adgb@ds.com", aliasType: 2, aliasDeleteDate: null },
      { alias: "echeck", aliasType: 2, aliasDeleteDate: null },
      { alias: "urn:mail:adpk@ds.com", aliasType: 1, aliasDeleteDate: null },
      { alias: "urn:mail:eski@pk.com", aliasType: 1, aliasDeleteDate: "2020-01-01" },
    ],
  });
  assert(recipient);
  assertEquals(recipient.is_efatura, true);
  assertEquals(recipient.pk_alias, "urn:mail:adpk@ds.com");
  assertEquals(recipient.name, "MYSOFT TEST");
});

Deno.test("mapMysoftGibAccount — GİB kaydı yoksa null (e-Arşiv alıcısı)", () => {
  assertEquals(
    mapMysoftGibAccount("11111111111", {
      data: null,
      succeed: true,
      message: null,
    }),
    null,
  );
});

Deno.test("isForeignBuyerCountry — Türkiye varyantları yurt içi", () => {
  assert(!isForeignBuyerCountry("Türkiye"));
  assert(!isForeignBuyerCountry("turkiye"));
  assert(!isForeignBuyerCountry(undefined));
  assert(isForeignBuyerCountry("Almanya"));
});
