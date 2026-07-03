import { assert, assertEquals, assertFalse } from "jsr:@std/assert";
import { normalizeMessagesForClaude } from "./chat-history.ts";
import { shouldSkipFinanceFastPaths } from "../_shared/invoice-workflow.ts";

Deno.test("normalizeMessagesForClaude — [action] ve ardışık user birleşir", () => {
  const out = normalizeMessagesForClaude([
    { role: "user", content: "merhaba" },
    { role: "user", content: "[action]" },
    { role: "user", content: "devam" },
    { role: "assistant", content: "tamam" },
  ]);
  assertEquals(out.length, 2);
  assertEquals(out[0].role, "user");
  assertEquals(out[0].content, "merhaba\ndevam");
});

Deno.test("shouldSkipFinanceFastPaths — kur onayı ve veri toplama", () => {
  assert(shouldSkipFinanceFastPaths({ status: "exchange_rate_pending" }));
  assert(
    shouldSkipFinanceFastPaths({
      request: { buyer_name: "Acme" },
    }),
  );
  assertFalse(
    shouldSkipFinanceFastPaths({
      status: "preview_ready",
      draft: { uuid: "x", date: "01/01/2026" },
    }),
  );
});
