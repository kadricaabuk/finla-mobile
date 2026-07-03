import { assert, assertEquals } from "jsr:@std/assert";
import {
  formatTrDate,
  istanbulPreviousMonthRange,
  istanbulQuarterRange,
  istanbulTodayUtc,
  parseTrDate,
  resolveDateRangeFromText,
} from "./date-range.ts";

function dayDiff(start: string, end: string): number {
  const s = parseTrDate(start)!;
  const e = parseTrDate(end)!;
  return Math.round((e.getTime() - s.getTime()) / (24 * 60 * 60 * 1000));
}

Deno.test("resolveDateRangeFromText — geçen ay", () => {
  const today = istanbulTodayUtc();
  const expected = istanbulPreviousMonthRange(today);
  const parsed = resolveDateRangeFromText("Geçen ayki faturaları getir");
  assert(parsed !== null);
  assertEquals(parsed!.startDate, expected.startDate);
  assertEquals(parsed!.endDate, expected.endDate);
});

Deno.test("resolveDateRangeFromText — son 3 gün", () => {
  const parsed = resolveDateRangeFromText("son 3 gün");
  assert(parsed !== null);
  assertEquals(dayDiff(parsed!.startDate, parsed!.endDate), 3);
});

Deno.test("resolveDateRangeFromText — son 2 ay", () => {
  const parsed = resolveDateRangeFromText("son 2 ay");
  assert(parsed !== null);
  const today = istanbulTodayUtc();
  const start = parseTrDate(parsed!.startDate)!;
  const monthsBack =
    (today.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (today.getUTCMonth() - start.getUTCMonth());
  assertEquals(monthsBack, 2);
});

Deno.test("resolveDateRangeFromText — bu hafta pazartesiden bugüne", () => {
  const parsed = resolveDateRangeFromText("bu hafta");
  assert(parsed !== null);
  const today = istanbulTodayUtc();
  const currentWeekday = (today.getUTCDay() + 6) % 7;
  const expectedStart = new Date(today);
  expectedStart.setUTCDate(today.getUTCDate() - currentWeekday);
  assertEquals(parsed!.startDate, formatTrDate(expectedStart));
  assertEquals(parsed!.endDate, formatTrDate(today));
});

Deno.test("resolveDateRangeFromText — geçen yıl", () => {
  const parsed = resolveDateRangeFromText("geçen yıl");
  assert(parsed !== null);
  assertYearRange(
    parsed!.startDate,
    parsed!.endDate,
    istanbulTodayUtc().getUTCFullYear() - 1,
  );
});

function assertYearRange(start: string, end: string, year: number): void {
  const s = parseTrDate(start)!;
  const e = parseTrDate(end)!;
  assertEquals(s.getUTCFullYear(), year);
  assertEquals(e.getUTCFullYear(), year);
  assertEquals(s.getUTCMonth(), 0);
  assertEquals(s.getUTCDate(), 1);
  assertEquals(e.getUTCMonth(), 11);
  assertEquals(e.getUTCDate(), 31);
}

Deno.test("resolveDateRangeFromText — geçen çeyrek", () => {
  const parsed = resolveDateRangeFromText("geçen çeyrekteki gelirlerim");
  assert(parsed !== null);
  const expected = istanbulQuarterRange(istanbulTodayUtc(), -1);
  assertEquals(parsed!.startDate, expected.startDate);
  assertEquals(parsed!.endDate, expected.endDate);
});

Deno.test("resolveDateRangeFromText — bu çeyrek", () => {
  const parsed = resolveDateRangeFromText("bu çeyrek ne kazandım");
  assert(parsed !== null);
  const expected = istanbulQuarterRange(istanbulTodayUtc(), 0);
  assertEquals(parsed!.startDate, expected.startDate);
  assertEquals(parsed!.endDate, expected.endDate);
});

Deno.test("resolveDateRangeFromText — numaralı ve sözlü çeyrek", () => {
  const year = istanbulTodayUtc().getUTCFullYear();
  const q3 = resolveDateRangeFromText("3. çeyrek faturaları");
  assert(q3 !== null);
  assertEquals(q3!.startDate, `01/07/${year}`);
  assertEquals(q3!.endDate, `30/09/${year}`);

  const q2 = resolveDateRangeFromText("ikinci çeyrek özeti");
  assert(q2 !== null);
  assertEquals(q2!.startDate, `01/04/${year}`);
  assertEquals(q2!.endDate, `30/06/${year}`);
});

Deno.test("istanbulQuarterRange — yıl sınırında önceki çeyrek", () => {
  const ocak = new Date(Date.UTC(2026, 0, 15));
  const prev = istanbulQuarterRange(ocak, -1);
  assertEquals(prev.startDate, "01/10/2025");
  assertEquals(prev.endDate, "31/12/2025");
});
