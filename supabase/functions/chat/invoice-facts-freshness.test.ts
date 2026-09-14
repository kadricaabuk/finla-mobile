import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  INVOICE_FACTS_FRESHNESS_TTL_MS,
  isSyncedAtFresh,
  stampSyncedAt,
} from "../_shared/invoice-facts.ts";

Deno.test("isSyncedAtFresh: null / invalid are stale", () => {
  const now = Date.parse("2026-09-08T08:00:00.000Z");
  assertEquals(isSyncedAtFresh(null, now), false);
  assertEquals(isSyncedAtFresh(undefined, now), false);
  assertEquals(isSyncedAtFresh("not-a-date", now), false);
});

Deno.test("isSyncedAtFresh: within TTL is fresh", () => {
  const now = Date.parse("2026-09-08T08:00:00.000Z");
  const syncedAt = new Date(now - 60_000).toISOString();
  assertEquals(isSyncedAtFresh(syncedAt, now), true);
});

Deno.test("isSyncedAtFresh: at/over TTL is stale", () => {
  const now = Date.parse("2026-09-08T08:00:00.000Z");
  const atTtl = new Date(now - INVOICE_FACTS_FRESHNESS_TTL_MS).toISOString();
  const overTtl = new Date(now - INVOICE_FACTS_FRESHNESS_TTL_MS - 1)
    .toISOString();
  assertEquals(isSyncedAtFresh(atTtl, now), false);
  assertEquals(isSyncedAtFresh(overTtl, now), false);
});

Deno.test("isSyncedAtFresh: future synced_at is not treated as fresh", () => {
  const now = Date.parse("2026-09-08T08:00:00.000Z");
  const future = new Date(now + 60_000).toISOString();
  assertEquals(isSyncedAtFresh(future, now), false);
});

Deno.test("stampSyncedAt: adds the same synced_at to every row", () => {
  const stamped = stampSyncedAt(
    [{ invoice_uuid: "a" }, { invoice_uuid: "b" }],
    "2026-09-08T08:00:00.000Z",
  );
  assertEquals(stamped, [
    { invoice_uuid: "a", synced_at: "2026-09-08T08:00:00.000Z" },
    { invoice_uuid: "b", synced_at: "2026-09-08T08:00:00.000Z" },
  ]);
});
