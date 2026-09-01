import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  containsSecretLike,
  escapeHtml,
  escapeMarkdownV2,
  formatStatusMessage,
  redactSecrets,
  splitForTelegram,
  TELEGRAM_MAX_MESSAGE_CHARS,
} from "./format.mjs";

const FAKE_TOKEN = "123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw";

describe("escapeMarkdownV2", () => {
  it("escapes the hyphen that breaks MarkdownV2 in practice", () => {
    // This is the exact failure seen when posting through Zapier.
    assert.equal(escapeMarkdownV2("invoice-detail"), "invoice\\-detail");
  });

  it("escapes every character Telegram lists as special", () => {
    const specials = "_*[]()~`>#+-=|{}.!";
    const escaped = escapeMarkdownV2(specials);
    for (const char of specials) {
      assert.ok(escaped.includes(`\\${char}`), `expected ${char} to be escaped`);
    }
  });

  it("escapes backslashes so they are not read as markup", () => {
    assert.equal(escapeMarkdownV2("a\\b"), "a\\\\b");
  });

  it("leaves ordinary text alone", () => {
    assert.equal(escapeMarkdownV2("Fatura olusturuldu"), "Fatura olusturuldu");
  });
});

describe("escapeHtml", () => {
  it("escapes only the three characters HTML mode needs", () => {
    assert.equal(escapeHtml('<b>a & b</b>'), "&lt;b&gt;a &amp; b&lt;/b&gt;");
  });

  it("does not touch characters that break MarkdownV2", () => {
    // The reason HTML is the safer parse mode for generated text.
    assert.equal(escapeHtml("invoice-detail.v2 (draft)"), "invoice-detail.v2 (draft)");
  });
});

describe("formatStatusMessage", () => {
  const now = new Date(2026, 8, 1, 9, 5);

  it("puts the role and timestamp on the first line", () => {
    const message = formatStatusMessage({
      label: "Fullstack Developer",
      body: "FIN-24 icin PR acildi.",
      now,
    });
    assert.equal(message, "Fullstack Developer — 2026-09-01 09:05\nFIN-24 icin PR acildi.");
  });

  it("zero-pads so the header width is stable across agents", () => {
    const message = formatStatusMessage({ label: "Muhasebeci", body: "x", now: new Date(2026, 0, 5, 3, 7) });
    assert.match(message, /^Muhasebeci — 2026-01-05 03:07\n/);
  });

  it("trims the body and survives an empty one", () => {
    assert.match(formatStatusMessage({ label: "R", body: "  hi  ", now }), /\nhi$/);
    assert.match(formatStatusMessage({ label: "R", body: undefined, now }), /09:05\n$/);
  });
});

describe("redactSecrets", () => {
  it("redacts a bot-token-shaped string", () => {
    const text = `sending with ${FAKE_TOKEN} now`;
    assert.equal(redactSecrets(text), "sending with [redacted] now");
    assert.doesNotMatch(redactSecrets(text), /AAHdqTcv/);
  });

  it("redacts every occurrence, not just the first", () => {
    const redacted = redactSecrets(`${FAKE_TOKEN} and ${FAKE_TOKEN}`);
    assert.equal(redacted, "[redacted] and [redacted]");
  });

  it("leaves ordinary text with colons and digits alone", () => {
    const text = "Run 12:45 finished, 3 invoices, ratio 1:2";
    assert.equal(redactSecrets(text), text);
  });

  it("detects token-like content", () => {
    assert.equal(containsSecretLike(`x ${FAKE_TOKEN}`), true);
    assert.equal(containsSecretLike("no secrets here"), false);
    // Regex is module-level with /g; repeated calls must not alternate.
    assert.equal(containsSecretLike(`x ${FAKE_TOKEN}`), true);
  });
});

describe("splitForTelegram", () => {
  it("returns a single chunk when the text fits", () => {
    assert.deepEqual(splitForTelegram("short"), ["short"]);
  });

  it("drops empty input rather than emitting a blank message", () => {
    assert.deepEqual(splitForTelegram(""), []);
    assert.deepEqual(splitForTelegram(null), []);
  });

  it("never emits a chunk longer than the limit", () => {
    const text = "x".repeat(TELEGRAM_MAX_MESSAGE_CHARS * 2 + 17);
    for (const chunk of splitForTelegram(text)) {
      assert.ok(chunk.length <= TELEGRAM_MAX_MESSAGE_CHARS);
    }
  });

  it("prefers splitting on a line boundary", () => {
    const chunks = splitForTelegram("aaaa\nbbbb\ncccc", 10);
    assert.deepEqual(chunks, ["aaaa\nbbbb", "cccc"]);
  });

  it("hard-splits a single line longer than the limit", () => {
    assert.deepEqual(splitForTelegram("abcdefghij", 4), ["abcd", "efgh", "ij"]);
  });

  it("preserves all content across chunks", () => {
    const text = Array.from({ length: 500 }, (_, i) => `line ${i}`).join("\n");
    const rejoined = splitForTelegram(text, 100).join("\n");
    assert.equal(rejoined, text);
  });

  it("rejects a nonsense limit instead of looping forever", () => {
    assert.throws(() => splitForTelegram("abc", 0), RangeError);
    assert.throws(() => splitForTelegram("abc", -5), RangeError);
  });
});
