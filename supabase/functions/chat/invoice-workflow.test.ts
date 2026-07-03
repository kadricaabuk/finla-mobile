import { assert, assertFalse } from "jsr:@std/assert";
import {
  canFastPathConfirmInvoiceIssue,
  formatPendingInvoiceForPrompt,
  type PendingInvoiceState,
} from "../_shared/invoice-workflow.ts";

Deno.test("canFastPathConfirmInvoiceIssue — yalnızca preview_ready + draft", () => {
  assertFalse(canFastPathConfirmInvoiceIssue(null));
  assertFalse(
    canFastPathConfirmInvoiceIssue({
      status: "exchange_rate_pending",
      request: { buyer_name: "Acme" },
    }),
  );
  assert(
    canFastPathConfirmInvoiceIssue({
      status: "preview_ready",
      draft: { uuid: "abc-123", date: "01/06/2026" },
      request: { buyer_name: "Acme" },
    }),
  );
});

Deno.test("formatPendingInvoiceForPrompt — döviz kuru bekleyen", () => {
  const text = formatPendingInvoiceForPrompt({
    status: "exchange_rate_pending",
    exchange_rate_quote: {
      currency: "USD",
      rate: "34.50",
      rate_date: "28/06/2026",
      source: "TCMB",
      rate_type: "forex_selling",
    },
    request: { buyer_name: "Acme Ltd" },
  });
  assert(text.includes("Döviz kuru onayı"));
  assert(text.includes("USD"));
  assert(text.includes("Acme Ltd"));
});

Deno.test("formatPendingInvoiceForPrompt — taslak hazır", () => {
  const text = formatPendingInvoiceForPrompt({
    status: "preview_ready",
    draft: { uuid: "ettn-1", date: "01/06/2026" },
    request: { buyer_name: "Beta AŞ" },
  });
  assert(text.includes("Taslak fatura"));
  assert(text.includes("ettn-1"));
});
