import { assertEquals } from "jsr:@std/assert";
import {
  type CustomerFactRow,
  dedupeKnownCustomers,
} from "./customer-lookup.ts";

const rows: CustomerFactRow[] = [
  {
    customer_name: "Selçan Yazılım A.Ş.",
    customer_tax_id: "1234567890",
    issue_date: "2026-06-15",
    gross_total: 1200,
    vat_total: 200,
    net_total: 1000,
    currency: "TRY",
    direction: "outgoing",
  },
  {
    customer_name: "Selçan Yazılım A.Ş.",
    customer_tax_id: "1234567890",
    issue_date: "2026-05-02",
    gross_total: 600,
    vat_total: 100,
    net_total: 500,
    currency: "TRY",
    direction: "outgoing",
  },
  {
    customer_name: "Selin Tekstil Ltd.",
    customer_tax_id: "9876543210",
    issue_date: "2026-04-01",
    gross_total: 300,
    vat_total: 50,
    net_total: 250,
    currency: "TRY",
    direction: "incoming",
  },
  {
    customer_name: "Ahmet Demir",
    customer_tax_id: "11111111111",
    issue_date: "2026-03-10",
    gross_total: 90,
    vat_total: 15,
    net_total: 75,
    currency: "TRY",
    direction: "outgoing",
  },
];

Deno.test("dedupeKnownCustomers — VKN başına tek kayıt, en güncel fatura + sayaç", () => {
  const result = dedupeKnownCustomers(rows, "selçan", 5);
  assertEquals(result.length, 1);
  assertEquals(result[0].customer_tax_id, "1234567890");
  assertEquals(result[0].invoice_count, 2);
  assertEquals(result[0].last_invoice_date, "2026-06-15");
  assertEquals(result[0].last_invoice_gross_total, 1200);
  assertEquals(result[0].last_invoice_net_total, 1000);
  assertEquals(result[0].last_invoice_vat_total, 200);
  assertEquals(result[0].last_invoice_direction, "outgoing");
});

Deno.test("dedupeKnownCustomers — Türkçe karakter duyarsız kısmi eşleşme", () => {
  const result = dedupeKnownCustomers(rows, "SELCAN yazilim", 5);
  assertEquals(result.length, 1);
  assertEquals(result[0].customer_name, "Selçan Yazılım A.Ş.");
});

Deno.test("dedupeKnownCustomers — birden çok eşleşme korunur", () => {
  const result = dedupeKnownCustomers(rows, "sel", 5);
  assertEquals(result.length, 2);
  assertEquals(result[1].last_invoice_direction, "incoming");
});

Deno.test("dedupeKnownCustomers — boş sorgu tüm tarafları döner, limit uygulanır", () => {
  assertEquals(dedupeKnownCustomers(rows, "", 8).length, 3);
  assertEquals(dedupeKnownCustomers(rows, "", 2).length, 2);
});

Deno.test("dedupeKnownCustomers — eşleşme yoksa boş liste", () => {
  assertEquals(dedupeKnownCustomers(rows, "mehmet", 5), []);
});

Deno.test("dedupeKnownCustomers — isim/VKN eksik satırlar atlanır", () => {
  const dirty: CustomerFactRow[] = [
    { customer_name: null, customer_tax_id: "123", issue_date: "2026-01-01" },
    { customer_name: "X", customer_tax_id: "  ", issue_date: "2026-01-01" },
  ];
  assertEquals(dedupeKnownCustomers(dirty, "", 5), []);
});
