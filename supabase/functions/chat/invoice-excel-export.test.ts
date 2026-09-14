import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { extractExportTaxFields } from "../_shared/invoice-export-tax-fields.ts";
import { buildExportSheetRowsForTest } from "../_shared/invoices-excel-export.ts";

Deno.test("extractExportTaxFields — tevkifat = vergiler dahil − ödenecek", () => {
  const fields = extractExportTaxFields({
    taxInclusiveAmount: 20000,
    payableAmount: 17000,
  });
  assertEquals(fields.taxInclusiveTotal, 20000);
  assertEquals(fields.payableTotal, 17000);
  assertEquals(fields.withholdingTotal, 3000);
  assertEquals(fields.exemptionCode, null);
});

Deno.test("extractExportTaxFields — açık tevkifat tutarı öncelikli", () => {
  const fields = extractExportTaxFields({
    taxInclusiveAmount: 20000,
    payableAmount: 17000,
    withholdingTaxAmount: 2999.5,
  });
  assertEquals(fields.withholdingTotal, 2999.5);
});

Deno.test("extractExportTaxFields — istisna kodu header veya tax dizisinden", () => {
  assertEquals(
    extractExportTaxFields({ taxExemptionReasonCode: "302" }).exemptionCode,
    "302",
  );
  assertEquals(
    extractExportTaxFields({
      tax: [
        {
          taxSubTotal: [{ taxExemptionReasonCode: "351" }],
        },
      ],
    }).exemptionCode,
    "351",
  );
});

Deno.test("extractExportTaxFields — payable ile aynı vergilerDahil tevkifat üretmez", () => {
  // mapMysoftHeaderToGibLike payable'ı vergilerDahilToplamTutar'a yazmış olabilir.
  const fields = extractExportTaxFields({
    payableAmount: 17000,
    vergilerDahilToplamTutar: 17000,
  });
  assertEquals(fields.taxInclusiveTotal, null);
  assertEquals(fields.withholdingTotal, null);
  assertEquals(fields.payableTotal, 17000);
});

Deno.test("Excel satırı — tevkifat ve istisna sütunları dolu", () => {
  const [row] = buildExportSheetRowsForTest([
    {
      invoice_uuid: "ettn-1",
      direction: "outgoing",
      issue_date: "2026-09-01",
      status: "approved",
      currency: "TRY",
      gross_total: 17000,
      vat_total: 3333.33,
      net_total: 16666.67,
      customer_tax_id: "1234567890",
      customer_name: "Test A.Ş.",
      raw_payload: {
        taxInclusiveAmount: 20000,
        payableAmount: 17000,
        taxExemptionReasonCode: "302",
      },
    },
  ]);
  assertEquals(row["Tevkifat tutarı"], 3000);
  assertEquals(row["İstisna kodu"], "302");
  assertEquals(row["Vergiler dahil toplam"], 20000);
  assertEquals(row["Ödenecek tutar"], 17000);
  assertEquals(row["Toplam"], undefined);
});
