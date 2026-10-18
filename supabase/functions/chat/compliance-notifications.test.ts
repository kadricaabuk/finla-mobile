import {
  assertEquals,
  assertExists,
  assertMatch,
  assertStringIncludes,
} from "jsr:@std/assert";
import {
  buildMevzuatUpdateNotification,
  COMPLIANCE_TEMPLATES,
  evaluateEFaturaThresholdApproach,
  formatComplianceNotificationForChat,
} from "../_shared/compliance-notifications.ts";

Deno.test("COMPLIANCE_TEMPLATES exposes exactly the two V1 ids", () => {
  assertEquals(COMPLIANCE_TEMPLATES.length, 2);
  assertEquals(
    COMPLIANCE_TEMPLATES.map((t) => t.id).sort(),
    ["efatura_threshold_approach", "mevzuat_update"],
  );
});

Deno.test("evaluateEFaturaThresholdApproach: null below warn ratio", () => {
  assertEquals(
    evaluateEFaturaThresholdApproach({
      year: 2026,
      ytdGrossTry: 700_000,
      thresholdTry: 1_000_000,
      warnAtRatio: 0.8,
    }),
    null,
  );
});

Deno.test("evaluateEFaturaThresholdApproach: fires at/above warn ratio", () => {
  const notice = evaluateEFaturaThresholdApproach({
    year: 2026,
    ytdGrossTry: 850_000,
    thresholdTry: 1_000_000,
    warnAtRatio: 0.8,
  });
  assertExists(notice);
  assertEquals(notice.templateId, "efatura_threshold_approach");
  assertEquals(notice.severity, "warning");
  assertEquals(notice.dedupeKey, "efatura_threshold_approach:2026");
  assertMatch(notice.title, /e-Fatura/);
  assertMatch(notice.body, /850\.000/);
});

Deno.test("evaluateEFaturaThresholdApproach: rejects bad thresholds", () => {
  assertEquals(
    evaluateEFaturaThresholdApproach({
      year: 2026,
      ytdGrossTry: 900_000,
      thresholdTry: 0,
    }),
    null,
  );
});

Deno.test("buildMevzuatUpdateNotification: requires summary + findingKey", () => {
  assertEquals(
    buildMevzuatUpdateNotification({ summary: "", findingKey: "x" }),
    null,
  );
  assertEquals(
    buildMevzuatUpdateNotification({ summary: "hi", findingKey: "" }),
    null,
  );
});

Deno.test("buildMevzuatUpdateNotification: includes source and date", () => {
  const notice = buildMevzuatUpdateNotification({
    summary: "UBL-TR paketinde yeni zorunlu alan eklendi.",
    sourceUrl: "https://example.gov.tr/ubl",
    effectiveDate: "2026-11-01",
    findingKey: "ubl-2026-w42",
  });
  assertExists(notice);
  assertEquals(notice.templateId, "mevzuat_update");
  assertEquals(notice.dedupeKey, "mevzuat_update:ubl-2026-w42");
  assertMatch(notice.body, /2026-11-01/);
  assertMatch(notice.body, /example\.gov\.tr/);
});

Deno.test("formatComplianceNotificationForChat wraps title as markdown", () => {
  const notice = evaluateEFaturaThresholdApproach({
    year: 2026,
    ytdGrossTry: 900_000,
    thresholdTry: 1_000_000,
  });
  assertExists(notice);
  const md = formatComplianceNotificationForChat(notice);
  assertStringIncludes(md, `**${notice.title}**`);
  assertStringIncludes(md, notice.body);
});
