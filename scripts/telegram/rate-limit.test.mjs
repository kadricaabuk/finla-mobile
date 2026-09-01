import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  checkRate,
  consumeSendAllowance,
  DEFAULT_MAX_IN_WINDOW,
  DEFAULT_WINDOW_MS,
  pruneWindow,
  resolveLimits,
} from "./rate-limit.mjs";

const LIMITS = { windowMs: 1000, maxInWindow: 3 };

describe("pruneWindow", () => {
  it("keeps only timestamps inside the window", () => {
    assert.deepEqual(pruneWindow([100, 500, 900], 1000, 600), [500, 900]);
  });

  it("tolerates empty and malformed input", () => {
    assert.deepEqual(pruneWindow([], 1000, 600), []);
    assert.deepEqual(pruneWindow(undefined, 1000, 600), []);
    assert.deepEqual(pruneWindow([NaN, null, 900], 1000, 600), [900]);
  });
});

describe("checkRate", () => {
  it("allows sends below the ceiling and counts down", () => {
    const first = checkRate([], 1000, LIMITS);
    assert.equal(first.allowed, true);
    assert.equal(first.remaining, 2);
    assert.deepEqual(first.timestamps, [1000]);

    const second = checkRate(first.timestamps, 1001, LIMITS);
    assert.equal(second.remaining, 1);
  });

  it("blocks once the ceiling is reached", () => {
    const result = checkRate([900, 950, 990], 1000, LIMITS);
    assert.equal(result.allowed, false);
    assert.equal(result.remaining, 0);
  });

  it("reports how long until the oldest send ages out", () => {
    const result = checkRate([900, 950, 990], 1000, LIMITS);
    // Oldest is 900, window 1000ms, so it frees up at 1900.
    assert.equal(result.retryAfterMs, 900);
  });

  it("allows again once old sends fall outside the window", () => {
    const result = checkRate([900, 950, 990], 2500, LIMITS);
    assert.equal(result.allowed, true);
    assert.deepEqual(result.timestamps, [2500]);
  });

  it("does not grow the record unboundedly", () => {
    let timestamps = [];
    for (let i = 0; i < 50; i += 1) {
      const result = checkRate(timestamps, 10_000 + i * 1000, LIMITS);
      timestamps = result.timestamps;
    }
    assert.ok(timestamps.length <= LIMITS.maxInWindow);
  });
});

describe("resolveLimits", () => {
  it("falls back to the defaults", () => {
    assert.deepEqual(resolveLimits({}), {
      windowMs: DEFAULT_WINDOW_MS,
      maxInWindow: DEFAULT_MAX_IN_WINDOW,
    });
  });

  it("honours valid overrides", () => {
    const limits = resolveLimits({
      TELEGRAM_SEND_WINDOW_MS: "5000",
      TELEGRAM_SEND_MAX_PER_WINDOW: "2",
    });
    assert.deepEqual(limits, { windowMs: 5000, maxInWindow: 2 });
  });

  it("ignores nonsense overrides rather than disabling the guard", () => {
    const limits = resolveLimits({
      TELEGRAM_SEND_WINDOW_MS: "0",
      TELEGRAM_SEND_MAX_PER_WINDOW: "-4",
    });
    assert.deepEqual(limits, {
      windowMs: DEFAULT_WINDOW_MS,
      maxInWindow: DEFAULT_MAX_IN_WINDOW,
    });
  });
});

describe("consumeSendAllowance", () => {
  const env = { TELEGRAM_SEND_WINDOW_MS: "60000", TELEGRAM_SEND_MAX_PER_WINDOW: "2" };
  const scope = () => `test-${Math.random().toString(36).slice(2)}`;

  it("permits sends up to the ceiling then throws", () => {
    const key = scope();
    assert.equal(consumeSendAllowance(key, { now: 1000, env }).remaining, 1);
    assert.equal(consumeSendAllowance(key, { now: 1100, env }).remaining, 0);
    assert.throws(
      () => consumeSendAllowance(key, { now: 1200, env }),
      /rate limit reached/i,
    );
  });

  it("recovers once the window passes", () => {
    const key = scope();
    consumeSendAllowance(key, { now: 1000, env });
    consumeSendAllowance(key, { now: 1100, env });
    assert.doesNotThrow(() => consumeSendAllowance(key, { now: 100_000, env }));
  });

  it("tracks each agent separately", () => {
    const a = scope();
    const b = scope();
    consumeSendAllowance(a, { now: 1000, env });
    consumeSendAllowance(a, { now: 1100, env });
    assert.throws(() => consumeSendAllowance(a, { now: 1200, env }));
    assert.doesNotThrow(() => consumeSendAllowance(b, { now: 1200, env }));
  });
});
