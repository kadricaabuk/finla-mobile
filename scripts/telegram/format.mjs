/**
 * Pure text handling for Telegram messages: escaping, length splitting, and a
 * last-resort secret guard. No network, no environment access.
 */

/** Telegram caps `sendMessage.text` at 1-4096 characters after parsing. */
export const TELEGRAM_MAX_MESSAGE_CHARS = 4096;

/**
 * Characters MarkdownV2 requires to be backslash-escaped. The backslash itself
 * is included because it must also be escaped.
 *
 * This is the cause of the `-` parse failures seen through Zapier: a hyphen in
 * ordinary prose is markup to MarkdownV2 and breaks the whole message unless
 * escaped.
 */
const MARKDOWN_V2_SPECIALS = /[\\_*[\]()~`>#+\-=|{}.!]/g;

const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };

/**
 * Telegram bot tokens look like `<bot_id>:<35-char secret>`.
 *
 * Matching is deliberately loose. A false positive only redacts a token-shaped
 * string in a chat message; a false negative leaks a live credential into a
 * group chat, which cannot be undone.
 */
const BOT_TOKEN_PATTERN = /\b\d{6,12}:[A-Za-z0-9_-]{30,}\b/g;

export function escapeMarkdownV2(text) {
  return String(text ?? "").replace(MARKDOWN_V2_SPECIALS, (char) => `\\${char}`);
}

/**
 * Escapes text for Telegram's HTML parse mode.
 *
 * HTML is the better choice for programmatically built messages: it needs
 * three characters escaped instead of MarkdownV2's eighteen, so it fails far
 * less often on arbitrary content like file paths, diffs, or issue titles.
 */
export function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>]/g, (char) => HTML_ESCAPES[char]);
}

/** Replaces anything shaped like a bot token so it cannot reach the group. */
export function redactSecrets(text) {
  return String(text ?? "").replace(BOT_TOKEN_PATTERN, "[redacted]");
}

export function containsSecretLike(text) {
  BOT_TOKEN_PATTERN.lastIndex = 0;
  return BOT_TOKEN_PATTERN.test(String(text ?? ""));
}

/**
 * Splits text into chunks Telegram will accept, preferring line boundaries so
 * agent reports do not get cut mid-sentence. Falls back to a hard split when a
 * single line is longer than the limit.
 */
export function splitForTelegram(text, limit = TELEGRAM_MAX_MESSAGE_CHARS) {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new RangeError(`limit must be a positive integer, got ${limit}`);
  }

  let rest = String(text ?? "");
  const chunks = [];

  while (rest.length > limit) {
    let cut = rest.lastIndexOf("\n", limit);
    if (cut <= 0) cut = limit;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n/, "");
  }
  chunks.push(rest);

  return chunks.filter((chunk) => chunk.length > 0);
}
