import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseTotalsFromHtml } from "../_shared/parse-invoice-html-totals.ts";
import { mapMysoftInboxModelToDetail } from "../_shared/mysoft-invoice-detail.ts";

Deno.test("parseTotalsFromHtml — ödenecek tutarı gross olarak önceliklendirir", () => {
  const html = `
    <table>
      <tr><td>Mal Hizmet Toplam Tutar</td><td>16.666,67 TL</td></tr>
      <tr><td>Hesaplanan KDV</td><td>3.333,33 TL</td></tr>
      <tr><td>Vergiler Dahil Toplam Tutar</td><td>20.000,00 TL</td></tr>
      <tr><td>Ödenecek Tutar</td><td>17.000,00 TL</td></tr>
    </table>
  `;
  const totals = parseTotalsFromHtml(html);
  assertEquals(totals.net, 16666.67);
  assertEquals(totals.vat, 3333.33);
  assertEquals(totals.taxInclusive, 20000);
  assertEquals(totals.payable, 17000);
  assertEquals(totals.gross, 17000);
});

Deno.test("parseTotalsFromHtml — ödenecek yoksa vergiler dahil kullanılır", () => {
  const html = `
    Mal Hizmet Toplam Tutar 1.000,00 TL
    Hesaplanan KDV 200,00 TL
    Vergiler Dahil Toplam Tutar 1.200,00 TL
  `;
  const totals = parseTotalsFromHtml(html);
  assertEquals(totals.gross, 1200);
  assertEquals(totals.payable, null);
  assertEquals(totals.taxInclusive, 1200);
});

Deno.test("mapMysoftInboxModelToDetail — payableAmount gross olur", () => {
  const detail = mapMysoftInboxModelToDetail(
    {
      docDate: "2026-09-01",
      documentCurrencyCode: "TRY",
      legalMonetaryTotal: {
        taxExclusiveAmount: 16666.67,
        taxInclusiveAmount: 20000,
        payableAmount: 17000,
      },
      taxTotal: [{ taxAmount: 3333.33 }],
      supplierInfo: {
        partyName: "Tedarikçi A.Ş.",
        identifierNumber: "1234567890",
      },
    },
    "ettn-tevkifat",
  );
  assertEquals(detail.gross_total, 17000);
  assertEquals(detail.vat_total, 3333.33);
  assertEquals(detail.net_total, 16666.67);
});
