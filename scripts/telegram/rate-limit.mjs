/**
 * Send rate limiting, required by Telegram once Bot-to-Bot Communication Mode
 * is on: "Bots can easily trigger infinite loops. You must prevent this by
 * implementing filtering or rate limits."
 *
 * Filtering lives in `inbox.mjs` (bot messages are never actionable). This is
 * the second half: a ceiling on how much one agent can say in a window.
 *
 * The state file lives in the OS temp dir, so it is shared by every CLI
 * invocation inside a single agent run and resets between runs. That matches
 * where the risk actually is. A cron-triggered agent cannot form a tight loop,
 * because no message can start a run; the realistic failure is one run going
 * haywire and flooding the group. Cross-run limiting would need durable
 * storage and only becomes necessary if triggering ever moves to webhooks.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const DEFAULT_WINDOW_MS = 10 * 60 * 1000;
export const DEFAULT_MAX_IN_WINDOW = 20;

/** Drops timestamps that have fallen outside the window. */
export function pruneWindow(timestamps, now, windowMs) {
  const cutoff = now - windowMs;
  return (timestamps ?? []).filter((ts) => Number.isFinite(ts) && ts > cutoff);
}

/**
 * Decides whether one more send is allowed, and returns the timestamps to
 * persist. Pure, so the policy is testable without touching the clock or disk.
 */
export function checkRate(timestamps, now, { windowMs, maxInWindow }) {
  const recent = pruneWindow(timestamps, now, windowMs);
  if (recent.length >= maxInWindow) {
    const retryAfterMs = Math.max(0, recent[0] + windowMs - now);
    return { allowed: false, remaining: 0, retryAfterMs, timestamps: recent };
  }
  return {
    allowed: true,
    remaining: maxInWindow - recent.length - 1,
    retryAfterMs: 0,
    timestamps: [...recent, now],
  };
}

function stateFile(scope) {
  const dir = join(tmpdir(), "finla-telegram");
  mkdirSync(dir, { recursive: true });
  return join(dir, `${String(scope).replace(/[^\w.-]/g, "_")}.json`);
}

function readTimestamps(path) {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return Array.isArray(parsed?.timestamps) ? parsed.timestamps : [];
  } catch {
    return [];
  }
}

export function resolveLimits(env = process.env) {
  const windowMs = Number(env.TELEGRAM_SEND_WINDOW_MS);
  const maxInWindow = Number(env.TELEGRAM_SEND_MAX_PER_WINDOW);
  return {
    windowMs: Number.isFinite(windowMs) && windowMs > 0 ? windowMs : DEFAULT_WINDOW_MS,
    maxInWindow:
      Number.isFinite(maxInWindow) && maxInWindow > 0 ? maxInWindow : DEFAULT_MAX_IN_WINDOW,
  };
}

/**
 * Records one send against `scope`, throwing when the ceiling is reached.
 *
 * Failing loudly is deliberate: a silent drop would leave an agent believing it
 * had reported when it had not.
 */
export function consumeSendAllowance(scope, { now = Date.now(), env = process.env } = {}) {
  const limits = resolveLimits(env);
  const path = stateFile(scope);
  const result = checkRate(readTimestamps(path), now, limits);

  if (!result.allowed) {
    const seconds = Math.ceil(result.retryAfterMs / 1000);
    throw new Error(
      `Telegram send rate limit reached for "${scope}": ${limits.maxInWindow} messages per ${Math.round(limits.windowMs / 60000)} minutes. Retry in ~${seconds}s. Raise TELEGRAM_SEND_MAX_PER_WINDOW only if the traffic is genuinely wanted -- this guard exists because Bot-to-Bot Communication Mode makes runaway loops possible.`,
    );
  }

  writeFileSync(path, JSON.stringify({ timestamps: result.timestamps }), "utf8");
  return { remaining: result.remaining };
}
