import {
  assertEquals,
  assertMatch,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts"
import {
  SHARE_TTL_SECONDS,
  buildOwnerFeedbackMessage,
  buildShareViewerHtml,
  escapeHtml,
  expiresAtFromNow,
  generateShareToken,
  isShareExpired,
  maskTaxId,
  normalizeShareDirection,
  sanitizeAuthorLabel,
  sanitizeCommentBody,
} from "../_shared/invoice-share.ts"

Deno.test("generateShareToken is url-safe and long enough", () => {
  const token = generateShareToken()
  assertEquals(token.length >= 40, true)
  assertMatch(token, /^[A-Za-z0-9_-]+$/)
})

Deno.test("expiresAtFromNow uses 2h TTL", () => {
  const now = Date.parse("2026-09-23T08:00:00.000Z")
  const expires = expiresAtFromNow(now)
  assertEquals(expires.toISOString(), "2026-09-23T10:00:00.000Z")
  assertEquals(SHARE_TTL_SECONDS, 7200)
})

Deno.test("isShareExpired", () => {
  const now = Date.parse("2026-09-23T10:00:00.000Z")
  assertEquals(isShareExpired("2026-09-23T09:59:59.000Z", now), true)
  assertEquals(isShareExpired("2026-09-23T10:00:01.000Z", now), false)
})

Deno.test("maskTaxId hides leading digits", () => {
  assertEquals(maskTaxId("1234567890"), "******7890")
  assertEquals(maskTaxId("12"), "**")
  assertEquals(maskTaxId(""), null)
})

Deno.test("sanitize comment + author", () => {
  assertEquals(sanitizeCommentBody("  merhaba  "), "merhaba")
  assertEquals(sanitizeCommentBody("   "), null)
  assertEquals(sanitizeAuthorLabel(""), null)
  assertEquals(sanitizeAuthorLabel("  Ayşe  "), "Ayşe")
})

Deno.test("normalizeShareDirection defaults to outgoing", () => {
  assertEquals(normalizeShareDirection("incoming"), "incoming")
  assertEquals(normalizeShareDirection("x"), "outgoing")
})

Deno.test("escapeHtml and viewer page", () => {
  assertEquals(escapeHtml(`a <b> & "c"`), "a &lt;b&gt; &amp; &quot;c&quot;")
  const page = buildShareViewerHtml({
    summary: {
      invoice_uuid: "abc",
      direction: "outgoing",
      issue_date: "2026-09-01",
      status: "approved",
      currency: "TRY",
      gross_total: 118,
      vat_total: 18,
      net_total: 100,
      customer_name: "Acme <Ltd>",
      customer_tax_id_masked: "******7890",
    },
    expiresAtIso: "2026-09-23T10:00:00.000Z",
    commentActionUrl: "https://example.test/functions/v1/invoice-share",
    token: "tok_test",
    existingComments: [],
  })
  assertStringIncludes(page, "Finla")
  assertStringIncludes(page, "Acme &lt;Ltd&gt;")
  assertStringIncludes(page, "tok_test")
  assertStringIncludes(page, "Yorum bırak")
})

Deno.test("buildOwnerFeedbackMessage", () => {
  const msg = buildOwnerFeedbackMessage({
    authorLabel: "Ali",
    body: "Tutar yanlış",
    customerName: "Acme",
    invoiceUuid: "u1",
  })
  assertStringIncludes(msg, "Ali")
  assertStringIncludes(msg, "Acme")
  assertStringIncludes(msg, "Tutar yanlış")
})
