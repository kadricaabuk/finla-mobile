/**
 * Minimal Telegram Bot API client.
 *
 * Dependency-free so it runs on the bare Node available in CI and Cursor Cloud
 * Agent VMs. Nothing here is Node-specific beyond `process`, so the module can
 * move to Deno if an Edge Function ever needs to post to the group.
 *
 * The bot token travels in the request URL, so every error path has to redact
 * it deliberately — an unredacted failure log would publish a live credential.
 */

import { redactSecrets, splitForTelegram, TELEGRAM_MAX_MESSAGE_CHARS } from "./format.mjs";

export const TELEGRAM_API_BASE = "https://api.telegram.org";

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_RETRY_MS = 500;
/** Refuse to sit out a flood-control wait longer than this. */
const DEFAULT_MAX_RETRY_AFTER_MS = 30_000;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

export class TelegramApiError extends Error {
  constructor(message, { status = null, errorCode = null, method = null } = {}) {
    super(message);
    this.name = "TelegramApiError";
    this.status = status;
    this.errorCode = errorCode;
    this.method = method;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Strips the token out of anything that might carry it, e.g. a URL in a stack. */
function scrub(text, token) {
  const withoutToken = token
    ? String(text ?? "").split(token).join("<bot_token>")
    : String(text ?? "");
  return redactSecrets(withoutToken);
}

export function createTelegramClient({
  token,
  apiBase = TELEGRAM_API_BASE,
  fetchImpl = globalThis.fetch,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  baseRetryMs = DEFAULT_BASE_RETRY_MS,
  maxRetryAfterMs = DEFAULT_MAX_RETRY_AFTER_MS,
} = {}) {
  if (!token) {
    throw new TelegramApiError("A Telegram bot token is required.");
  }
  if (typeof fetchImpl !== "function") {
    throw new TelegramApiError("No fetch implementation available; Node 18+ is required.");
  }

  const endpoint = (method) => `${apiBase}/bot${token}/${method}`;

  async function call(method, payload = {}) {
    let lastError;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      let response;
      try {
        response = await fetchImpl(endpoint(method), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } catch (cause) {
        lastError = new TelegramApiError(
          `Network error calling Telegram ${method}: ${scrub(cause.message, token)}`,
          { method },
        );
        if (attempt < maxAttempts) {
          await sleep(baseRetryMs * 2 ** (attempt - 1));
          continue;
        }
        throw lastError;
      }

      let body = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }

      if (response.ok && body?.ok) {
        return body.result;
      }

      const description = scrub(body?.description ?? `HTTP ${response.status}`, token);
      lastError = new TelegramApiError(`Telegram ${method} failed: ${description}`, {
        status: response.status,
        errorCode: body?.error_code ?? null,
        method,
      });

      // Telegram reports flood control with an explicit wait, which is more
      // accurate than guessing with a backoff curve.
      const retryAfterMs = Number(body?.parameters?.retry_after ?? 0) * 1000;
      const retryable = RETRYABLE_STATUSES.has(response.status) || retryAfterMs > 0;

      if (retryable && attempt < maxAttempts) {
        const waitMs = retryAfterMs || baseRetryMs * 2 ** (attempt - 1);
        if (waitMs > maxRetryAfterMs) throw lastError;
        await sleep(waitMs);
        continue;
      }

      throw lastError;
    }

    throw lastError;
  }

  /** Confirms the token works and returns the bot identity behind it. */
  async function getMe() {
    return call("getMe");
  }

  /**
   * Sends text to a chat, splitting it across messages when it exceeds
   * Telegram's per-message limit and redacting anything token-shaped first.
   *
   * `parseMode` is omitted by default. Plain text cannot fail to parse, whereas
   * MarkdownV2 rejects unescaped `-`, `.` and a dozen other characters that
   * appear constantly in agent output.
   */
  async function sendMessage({
    chatId,
    text,
    parseMode = null,
    disableLinkPreview = true,
    limit = TELEGRAM_MAX_MESSAGE_CHARS,
  }) {
    if (!chatId) throw new TelegramApiError("chatId is required.");

    // Whitespace-only content would be rejected by Telegram anyway, and an
    // agent with nothing to report should stay quiet rather than post a blank.
    const normalized = redactSecrets(text);
    const chunks = splitForTelegram(normalized, limit).filter(
      (chunk) => chunk.trim().length > 0,
    );
    if (chunks.length === 0) {
      throw new TelegramApiError("Refusing to send an empty message.");
    }

    const sent = [];
    for (const chunk of chunks) {
      const payload = {
        chat_id: chatId,
        text: chunk,
        link_preview_options: { is_disabled: Boolean(disableLinkPreview) },
      };
      if (parseMode) payload.parse_mode = parseMode;
      const result = await call("sendMessage", payload);
      sent.push({ messageId: result?.message_id ?? null, chars: chunk.length });
    }
    return sent;
  }

  /**
   * Recent updates, used to discover the group chat id.
   *
   * Only works before a webhook is set — the two delivery modes are mutually
   * exclusive — and Telegram keeps undelivered updates for just 24 hours.
   */
  async function getUpdates({ limit = 100, offset = null } = {}) {
    const payload = { limit };
    if (offset !== null) payload.offset = offset;
    return call("getUpdates", payload);
  }

  /**
   * Acknowledges everything up to and including `throughUpdateId`, so the next
   * poll only returns newer messages.
   *
   * Kept separate from reading so a run that fails mid-work sees the same
   * messages again instead of losing them.
   */
  async function confirmUpdates(throughUpdateId) {
    if (!Number.isInteger(throughUpdateId)) {
      throw new TelegramApiError("confirmUpdates requires an integer update id.");
    }
    await call("getUpdates", { offset: throughUpdateId + 1, limit: 1 });
    return { confirmedThrough: throughUpdateId };
  }

  return { call, getMe, sendMessage, getUpdates, confirmUpdates };
}

/** Collapses `getUpdates` output into the distinct chats the bot can see. */
export function extractChats(updates) {
  const byId = new Map();
  for (const update of updates ?? []) {
    const message =
      update.message ?? update.channel_post ?? update.edited_message ?? update.my_chat_member;
    const chat = message?.chat;
    if (!chat?.id) continue;
    byId.set(chat.id, { id: chat.id, type: chat.type, title: chat.title ?? chat.username ?? null });
  }
  return [...byId.values()];
}
