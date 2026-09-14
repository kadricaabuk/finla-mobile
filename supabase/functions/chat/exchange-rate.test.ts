import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseTcmbForexBuyingRateForTest } from "../_shared/exchange-rate.ts";

const SAMPLE_XML = `<?xml version="1.0"?>
<Tarih_Date Tarih="02.09.2026" Date="09/02/2026">
  <Currency CrossOrder="0" Kod="USD" CurrencyCode="USD">
    <Unit>1</Unit>
    <Isim>ABD DOLARI</Isim>
    <ForexBuying>34.1000</ForexBuying>
    <ForexSelling>34.2500</ForexSelling>
  </Currency>
  <Currency CrossOrder="1" Kod="EUR" CurrencyCode="EUR">
    <Unit>1</Unit>
    <Isim>EURO</Isim>
    <ForexBuying>37.5000</ForexBuying>
    <ForexSelling>37.7000</ForexSelling>
  </Currency>
</Tarih_Date>`;

Deno.test("TCMB XML — ForexBuying okunur, ForexSelling yok sayılır", () => {
  const usd = parseTcmbForexBuyingRateForTest(SAMPLE_XML, "USD");
  assertEquals(usd?.rate, 34.1);
  assertEquals(usd?.rateDate, "02/09/2026");

  const eur = parseTcmbForexBuyingRateForTest(SAMPLE_XML, "EUR");
  assertEquals(eur?.rate, 37.5);
});

Deno.test("TCMB XML — ForexBuying yoksa null", () => {
  const xml = `<?xml version="1.0"?>
<Tarih_Date Tarih="02.09.2026">
  <Currency CurrencyCode="USD">
    <Unit>1</Unit>
    <ForexSelling>34.2500</ForexSelling>
  </Currency>
</Tarih_Date>`;
  assertEquals(parseTcmbForexBuyingRateForTest(xml, "USD"), null);
});
