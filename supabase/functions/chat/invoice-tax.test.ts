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
  classifyMysoftOutboxDocument,
  isForeignBuyerCountry,
  mapMysoftGibAccount,
} from "../_shared/mysoft-mapper.ts";
import {
  assertReturnMatchesOriginal,
  computeLineAmounts,
  findIncomingInvoiceByDocNo,
  validateInvoiceLinePricing,
  validateReturnRef,
  type CreateInvoiceInput,
} from "../_shared/invoice-mapper.ts";

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

Deno.test("computeLineAmounts — KDV iskonto sonrası matrahtan", () => {
  // %10 iskonto: 1.000 → matrah 900, KDV 180
  const withRate = computeLineAmounts({
    name: "x",
    quantity: 1,
    unit: "adet",
    unitPrice: 1000,
    vatRate: 20,
    discountRate: 10,
  });
  assertEquals(withRate.gross, 1000);
  assertEquals(withRate.discount, 100);
  assertEquals(withRate.taxable, 900);
  assertEquals(withRate.vat, 180);

  // Tutar iskontosu: 250 TL
  const withAmount = computeLineAmounts({
    name: "x",
    quantity: 2,
    unit: "adet",
    unitPrice: 500,
    vatRate: 20,
    discountAmount: 250,
  });
  assertEquals(withAmount.taxable, 750);
  assertEquals(withAmount.vat, 150);
});

Deno.test("validateInvoiceLinePricing — iskonto kuralları", () => {
  const base = { name: "x", quantity: 1, unit: "adet", unitPrice: 100, vatRate: 20 };
  assertThrows(
    () =>
      validateInvoiceLinePricing([
        { ...base, discountRate: 10, discountAmount: 5 },
      ]),
    Error,
    "birini seç",
  );
  assertThrows(
    () => validateInvoiceLinePricing([{ ...base, discountRate: 100 }]),
    Error,
    "0 ile 100",
  );
  assertThrows(
    () => validateInvoiceLinePricing([{ ...base, discountAmount: 150 }]),
    Error,
    "aşamaz",
  );
  assertThrows(
    () => validateInvoiceLinePricing([{ ...base, quantity: 0 }]),
    Error,
    "büyük olmalı",
  );
  // Geçerli girişler hata fırlatmamalı
  validateInvoiceLinePricing([
    { ...base, discountRate: 15 },
    { ...base, discountAmount: 20 },
    base,
  ]);
});

Deno.test("buildMysoftInvoiceOutboxBody — iskonto + vade + not", () => {
  const body = buildMysoftInvoiceOutboxBody(
    baseInput({
      dueDate: "01/08/2026",
      note: "IBAN: TR00 0000 0000",
      items: [
        {
          name: "Ürün",
          quantity: 1,
          unit: "adet",
          unitPrice: 1000,
          vatRate: 20,
          discountRate: 10,
        },
      ],
    }),
    "1234567890",
    null,
    { isSaveAsDraft: true },
  );

  const detail = (body.invoiceDetail as Record<string, unknown>[])[0];
  assertEquals(detail.discRate, 10);
  assertEquals(detail.discAmtTra, "100.00");
  assertEquals(detail.taxableAmtTra, 900);
  assertEquals(detail.amtVatTra, "180.00");

  const calc = body.invoiceCalculation as Record<string, number>;
  assertEquals(calc.lineExtensionAmount, 1000); // iskonto öncesi
  assertEquals(calc.allowanceTotalAmount, 100);
  assertEquals(calc.taxExclusiveAmount, 900); // matrah
  assertEquals(calc.taxInclusiveAmount, 1080);
  assertEquals(calc.payableAmount, 1080);

  assertEquals(body.dueDate, "2026-08-01");
  assertEquals((body.notes as { note: string }[])[0].note, "IBAN: TR00 0000 0000");
});

Deno.test("buildMysoftInvoiceOutboxBody — iskontosuz faturada iskonto alanları yok", () => {
  const body = buildMysoftInvoiceOutboxBody(baseInput(), "1234567890", null, {
    isSaveAsDraft: true,
  });
  const detail = (body.invoiceDetail as Record<string, unknown>[])[0];
  assert(!("discRate" in detail));
  assert(!("discAmtTra" in detail));
  assert(!("dueDate" in body));
  assert(!("notes" in body));
});

Deno.test("buildMysoftInvoiceOutboxBody — tevkifat iskonto sonrası KDV'den", () => {
  const body = buildMysoftInvoiceOutboxBody(
    baseInput({
      items: [
        {
          name: "Temizlik hizmeti",
          quantity: 1,
          unit: "adet",
          unitPrice: 10000,
          vatRate: 20,
          withholdingCode: "612", // 9/10
          discountRate: 10,
        },
      ],
    }),
    "1234567890",
    null,
    { isSaveAsDraft: true },
  );
  const detail = (body.invoiceDetail as Record<string, unknown>[])[0];
  // Matrah 9.000 → KDV 1.800 → tevkifat 1.620
  assertEquals(detail.amtVatTra, "1800.00");
  assertAlmostEquals(Number(detail.withholdingTaxAmount), 1620, 0.01);
  const calc = body.invoiceCalculation as Record<string, number>;
  assertAlmostEquals(calc.payableAmount, 10800 - 1620, 0.01);
});

Deno.test("isForeignBuyerCountry — Türkiye varyantları yurt içi", () => {
  assert(!isForeignBuyerCountry("Türkiye"));
  assert(!isForeignBuyerCountry("turkiye"));
  assert(!isForeignBuyerCountry(undefined));
  assert(isForeignBuyerCountry("Almanya"));
});

// ── Faz 2: İade faturası ────────────────────────────────────────────────

Deno.test("IADE — returnRef ile invoiceType ve billingRefInvoiceList", () => {
  const body = buildMysoftInvoiceOutboxBody(
    baseInput({
      returnRef: {
        invoiceNo: "abc2026000000123",
        invoiceDate: "15/05/2026",
        reason: "Ürün hasarlı geldi",
      },
    }),
    "1234567890",
    null,
    { isSaveAsDraft: true },
  );
  assertEquals(body.invoiceType, "IADE");
  assertEquals(body.eDocumentType, "EARSIVFATURA");
  const refs = body.billingRefInvoiceList as Record<string, unknown>[];
  assertEquals(refs.length, 1);
  assertEquals(refs[0].billingRefInvoiceNo, "ABC2026000000123");
  assertEquals(refs[0].billingRefInvoiceDate, "2026-05-15");
  assertEquals(refs[0].billingRefNote, "Ürün hasarlı geldi");
  // İade sebebi fatura üzerinde görünsün diye notlara da eklenir.
  const notes = body.notes as { note: string }[];
  assertEquals(notes.length, 1);
  assertEquals(notes[0].note, "İade sebebi: Ürün hasarlı geldi");
  // Toplamlar normal fatura gibi hesaplanır.
  const calc = body.invoiceCalculation as Record<string, number>;
  assertAlmostEquals(calc.payableAmount, 12000, 0.01);
});

Deno.test("IADE — tevkifatlı faturanın iadesi engellenir", () => {
  assertThrows(
    () =>
      buildMysoftInvoiceOutboxBody(
        baseInput({
          returnRef: { invoiceNo: "ABC2026000000123", invoiceDate: "15/05/2026" },
          items: [
            {
              name: "Temizlik hizmeti",
              quantity: 1,
              unit: "adet",
              unitPrice: 20000,
              vatRate: 20,
              withholdingCode: "612",
            },
          ],
        }),
        "1234567890",
        null,
        { isSaveAsDraft: true },
      ),
    Error,
    "iadesi özel düzeltme",
  );
});

Deno.test("validateReturnRef — eksik/bozuk referans reddedilir", () => {
  assertThrows(
    () => validateReturnRef({ invoiceNo: "", invoiceDate: "15/05/2026" }),
    Error,
    "belge numarası ve tarihi zorunlu",
  );
  assertThrows(
    () => validateReturnRef({ invoiceNo: "ABC123", invoiceDate: "15/05/2026" }),
    Error,
    "belge numarası geçersiz",
  );
  assertThrows(
    () =>
      validateReturnRef({
        invoiceNo: "ABC2026000000123",
        invoiceDate: "2026-05-15",
      }),
    Error,
    "GG/AA/YYYY",
  );
  // Geçerli referans hata fırlatmaz.
  validateReturnRef({ invoiceNo: "ABC2026000000123", invoiceDate: "15/05/2026" });
});

Deno.test("findIncomingInvoiceByDocNo — belge no eşleşmesi", () => {
  const rows = [
    { belgeNumarasi: "XYZ2026000000001", gondericiVknTckn: "9876543210" },
    { docNo: "abc2026000000123", gondericiVknTckn: "1112223334" },
  ];
  const hit = findIncomingInvoiceByDocNo(rows, "ABC2026000000123");
  assert(hit !== null);
  assertEquals(hit!.gondericiVknTckn, "1112223334");
  assertEquals(findIncomingInvoiceByDocNo(rows, "YOK2026000000009"), null);
});

Deno.test("assertReturnMatchesOriginal — VKN, tutar ve para birimi kontrolü", () => {
  const original = {
    belgeNumarasi: "ABC2026000000123",
    gondericiVknTckn: "9876543210",
    vergilerDahilToplamTutar: "2.360,00",
    paraBirimi: "TRY",
  };
  // Yanlış alıcı VKN → hata
  assertThrows(
    () =>
      assertReturnMatchesOriginal(original, {
        buyerTaxId: "1111111111",
        grossTotal: 1000,
        currency: "TRY",
      }),
    Error,
    "orijinal faturayı kesen tarafa",
  );
  // Orijinali aşan iade tutarı → hata
  assertThrows(
    () =>
      assertReturnMatchesOriginal(original, {
        buyerTaxId: "9876543210",
        grossTotal: 3000,
        currency: "TRY",
      }),
    Error,
    "aşamaz",
  );
  // Para birimi uyuşmazlığı → hata
  assertThrows(
    () =>
      assertReturnMatchesOriginal(original, {
        buyerTaxId: "9876543210",
        grossTotal: 100,
        currency: "USD",
      }),
    Error,
    "aynı para biriminde",
  );
  // Kısmi iade (orijinalin altı) geçer.
  assertReturnMatchesOriginal(original, {
    buyerTaxId: "9876543210",
    grossTotal: 2360,
    currency: "TRY",
  });
});

Deno.test("classifyMysoftOutboxDocument — e-Arşiv / e-Fatura / unknown", () => {
  assertEquals(
    classifyMysoftOutboxDocument({ eDocumentType: "EARSIVFATURA" }),
    "earsiv",
  );
  assertEquals(
    classifyMysoftOutboxDocument({ data: { profile: "EARSIVFATURA" } }),
    "earsiv",
  );
  assertEquals(
    classifyMysoftOutboxDocument({ eDocumentType: "EFATURA" }),
    "efatura",
  );
  assertEquals(
    classifyMysoftOutboxDocument({ profile: "TEMELFATURA" }),
    "efatura",
  );
  assertEquals(
    classifyMysoftOutboxDocument({ belgeTuru: "TICARIFATURA" }),
    "efatura",
  );
  assertEquals(classifyMysoftOutboxDocument({ status: "Sent" }), "unknown");
  assertEquals(classifyMysoftOutboxDocument(null), "unknown");
});
