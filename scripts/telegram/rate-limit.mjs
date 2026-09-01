/**
 * Send rate limiting, required by Telegram once Bot-to-Bot Communication Mode
 * is on: "Bots can easily trigger infinite loops. You must prevent this by
 * implementing filtering or rate limits."
 *
 * Filtering lives in `inbox.mjs` (bot messages are never actionable). This is
 * the second half: a ceiling on how much one agent can say in a window.
 *
 * The state file lives in the OS temp dir. On a throwaway VM that file dies
 * with the machine, so "per run" and "per VM" are the same. On a developer Mac
 * the file is sticky: set TELEGRAM_RUN_ID (qa-agent/run.sh does this) so each
 * orchestrator invocation is a new run. The 20-per-10-minutes window still
 * spans processes. Cross-day flooding would need durable storage and only
 * becomes necessary if triggering ever moves to webhooks.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const DEFAULT_WINDOW_MS = 10 * 60 * 1000;
export const DEFAULT_MAX_IN_WINDOW = 20;

/**
 * One status message per run, per the agent brief. Pair with TELEGRAM_RUN_ID
 * when the same Mac runs more than one job (launchd 10:00 then 16:00).
 *
 * Long reports are unaffected: splitting past 4096 characters happens inside a
 * single `send`, which spends one allowance regardless of how many chunks it
 * takes.
 */
export const DEFAULT_MAX_PER_RUN = 1;

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

function readState(path) {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return {
      timestamps: Array.isArray(parsed?.timestamps) ? parsed.timestamps : [],
      runCount: Number.isInteger(parsed?.runCount) ? parsed.runCount : 0,
      runId: typeof parsed?.runId === "string" ? parsed.runId : "",
    };
  } catch {
    return { timestamps: [], runCount: 0, runId: "" };
  }
}

const positiveOr = (raw, fallback) => {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

export function resolveLimits(env = process.env) {
  return {
    windowMs: positiveOr(env.TELEGRAM_SEND_WINDOW_MS, DEFAULT_WINDOW_MS),
    maxInWindow: positiveOr(env.TELEGRAM_SEND_MAX_PER_WINDOW, DEFAULT_MAX_IN_WINDOW),
    maxPerRun: positiveOr(env.TELEGRAM_SEND_MAX_PER_RUN, DEFAULT_MAX_PER_RUN),
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
  const state = readState(path);
  const incomingRunId = typeof env.TELEGRAM_RUN_ID === "string" ? env.TELEGRAM_RUN_ID.trim() : "";
  if (incomingRunId && incomingRunId !== state.runId) {
    state.runCount = 0;
    state.runId = incomingRunId;
  }

  if (state.runCount >= limits.maxPerRun) {
    throw new Error(
      `"${scope}" has already sent ${state.runCount} message(s) this run and the cap is ${limits.maxPerRun}. Post one status message per run summarising everything, rather than a message per finding. Override with TELEGRAM_SEND_MAX_PER_RUN only when several messages are genuinely wanted.`,
    );
  }

  const result = checkRate(state.timestamps, now, limits);
  if (!result.allowed) {
    const seconds = Math.ceil(result.retryAfterMs / 1000);
    throw new Error(
      `Telegram send rate limit reached for "${scope}": ${limits.maxInWindow} messages per ${Math.round(limits.windowMs / 60000)} minutes. Retry in ~${seconds}s. Raise TELEGRAM_SEND_MAX_PER_WINDOW only if the traffic is genuinely wanted -- this guard exists because Bot-to-Bot Communication Mode makes runaway loops possible.`,
    );
  }

  const runCount = state.runCount + 1;
  writeFileSync(
    path,
    JSON.stringify({ timestamps: result.timestamps, runCount, runId: state.runId }),
    "utf8",
  );
  return { remaining: result.remaining, sentThisRun: runCount, maxPerRun: limits.maxPerRun };
}
