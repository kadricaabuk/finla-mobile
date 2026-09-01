/**
 * Turns raw `getUpdates` output into an agent's inbox.
 *
 * Pure functions over plain data, so the rules deciding what an agent acts on
 * are unit tested rather than re-derived by a model on every run.
 *
 * Each agent has its own bot, and Telegram keeps a separate update queue per
 * bot token, so agents reading the same group never consume each other's
 * messages. That only breaks if two readers share one token.
 */

/**
 * Messages are sorted into two buckets:
 *
 * - `directed` — addressed to this agent, and therefore actionable.
 * - `context`  — everything else in the group, for situational awareness only.
 *
 * Bot-authored messages are always context, never directed, even when they
 * mention this bot. That is the loop guard: without it, two agents that answer
 * each other's mentions would trigger runs indefinitely, and neither Telegram
 * nor Cursor caps that.
 */
export const DIRECTED = "directed";
export const CONTEXT = "context";

/**
 * Humans whose messages may become actionable. Everyone else in the group is
 * read-only as far as the agents are concerned.
 *
 * An allowlist rather than "any human" because the group is an untrusted input
 * channel: whoever can post could otherwise steer code changes on a fintech
 * repo. Override with TELEGRAM_DIRECTED_USERNAMES (comma separated).
 */
export const DEFAULT_DIRECTED_USERNAMES = ["kadricaabuk"];

export function resolveDirectedUsernames(env = process.env) {
  const raw = env.TELEGRAM_DIRECTED_USERNAMES;
  if (!raw) return DEFAULT_DIRECTED_USERNAMES;
  const names = String(raw)
    .split(",")
    .map((name) => name.trim().replace(/^@/, "").toLowerCase())
    .filter(Boolean);
  return names.length > 0 ? names : DEFAULT_DIRECTED_USERNAMES;
}

export function isAllowedSender(message, allowedUsernames) {
  if (message.fromIsBot) return false;
  if (!allowedUsernames || allowedUsernames.length === 0) return true;
  const username = String(message.fromUsername ?? "").toLowerCase();
  return allowedUsernames.some((name) => name.toLowerCase() === username);
}

const textOf = (message) => message?.text ?? message?.caption ?? "";

/** Flattens the message-bearing part of an update, ignoring service events. */
export function normalizeUpdate(update) {
  const message = update?.message ?? update?.edited_message ?? update?.channel_post ?? null;
  if (!message) return null;

  const from = message.from ?? {};
  return {
    updateId: update.update_id,
    messageId: message.message_id ?? null,
    chatId: message.chat?.id ?? null,
    date: message.date ?? null,
    text: textOf(message),
    fromId: from.id ?? null,
    fromUsername: from.username ?? null,
    fromName: [from.first_name, from.last_name].filter(Boolean).join(" ") || null,
    fromIsBot: Boolean(from.is_bot),
    replyToFromId: message.reply_to_message?.from?.id ?? null,
    replyToText: textOf(message.reply_to_message) || null,
  };
}

/** True when the text names this bot, either as a mention or a `/cmd@bot`. */
export function mentionsBot(text, botUsername) {
  if (!botUsername) return false;
  const pattern = new RegExp(`@${botUsername.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
  return pattern.test(String(text ?? ""));
}

export function isReplyToBot(message, botId) {
  return Boolean(botId) && message.replyToFromId === botId;
}

/**
 * Decides whether a message is this agent's business.
 *
 * A human addressing the bot by @username, or replying to something the bot
 * said, is directed. Everything else — including bot chatter that names this
 * bot — is context.
 */
export function classify(message, { botUsername, botId, allowedUsernames = null }) {
  if (!isAllowedSender(message, allowedUsernames)) return CONTEXT;
  if (mentionsBot(message.text, botUsername)) return DIRECTED;
  if (isReplyToBot(message, botId)) return DIRECTED;
  return CONTEXT;
}

/**
 * Builds the inbox for one agent from a batch of updates.
 *
 * `lastUpdateId` is what to acknowledge once the work is done. Reading and
 * acknowledging are separate on purpose: a run that dies mid-work should see
 * the same messages again rather than lose them.
 */
export function buildInbox(
  updates,
  { botUsername, botId, chatId = null, allowedUsernames = null } = {},
) {
  const directed = [];
  const context = [];
  let lastUpdateId = null;

  for (const update of updates ?? []) {
    if (typeof update?.update_id === "number") {
      lastUpdateId = Math.max(lastUpdateId ?? update.update_id, update.update_id);
    }

    const message = normalizeUpdate(update);
    if (!message) continue;
    if (chatId !== null && String(message.chatId) !== String(chatId)) continue;

    if (classify(message, { botUsername, botId, allowedUsernames }) === DIRECTED) {
      directed.push(message);
    } else {
      context.push(message);
    }
  }

  return { directed, context, lastUpdateId };
}
