import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildInbox,
  classify,
  CONTEXT,
  DEFAULT_DIRECTED_USERNAMES,
  DIRECTED,
  isAllowedSender,
  mentionsBot,
  normalizeUpdate,
  resolveDirectedUsernames,
} from "./inbox.mjs";

const BOT_ID = 8651503137;
const BOT_USERNAME = "dev_finla_bot";
const CHAT_ID = -1003716262054;

const BOT = { botUsername: BOT_USERNAME, botId: BOT_ID };

let nextUpdateId = 1000;

function update({
  text = "",
  isBot = false,
  fromId = 42,
  username = null,
  replyToFromId = null,
  chatId = CHAT_ID,
} = {}) {
  nextUpdateId += 1;
  return {
    update_id: nextUpdateId,
    message: {
      message_id: nextUpdateId,
      date: 1788253337,
      chat: { id: chatId, type: "supergroup", title: "FINLA" },
      from: {
        id: fromId,
        is_bot: isBot,
        first_name: isBot ? "Co-founder" : "Kadri",
        username: username ?? (isBot ? "cfo_finla_bot" : "kadricaabuk"),
      },
      text,
      ...(replyToFromId ? { reply_to_message: { from: { id: replyToFromId }, text: "earlier" } } : {}),
    },
  };
}

const ALLOWED = DEFAULT_DIRECTED_USERNAMES;

describe("mentionsBot", () => {
  it("matches the bot's @username case-insensitively", () => {
    assert.equal(mentionsBot("hey @dev_finla_bot bak", BOT_USERNAME), true);
    assert.equal(mentionsBot("HEY @DEV_FINLA_BOT", BOT_USERNAME), true);
  });

  it("matches a command addressed to the bot", () => {
    assert.equal(mentionsBot("/start@dev_finla_bot", BOT_USERNAME), true);
  });

  it("does not match a different bot with a shared prefix", () => {
    assert.equal(mentionsBot("@dev_finla_bot_two hi", BOT_USERNAME), false);
    assert.equal(mentionsBot("@product_analyst_finla_bot hi", BOT_USERNAME), false);
  });

  it("does not match plain prose", () => {
    assert.equal(mentionsBot("dev_finla_bot without the at sign", BOT_USERNAME), false);
    assert.equal(mentionsBot("", BOT_USERNAME), false);
  });
});

describe("classify", () => {
  const normalized = (opts) => normalizeUpdate(update(opts));

  it("treats a human @mention as directed", () => {
    assert.equal(classify(normalized({ text: "@dev_finla_bot bunu yap" }), BOT), DIRECTED);
  });

  it("treats a human reply to the bot as directed", () => {
    assert.equal(classify(normalized({ text: "tamam", replyToFromId: BOT_ID }), BOT), DIRECTED);
  });

  it("treats unrelated human chatter as context", () => {
    assert.equal(classify(normalized({ text: "bugun hava guzel" }), BOT), CONTEXT);
  });

  it("treats a reply to a different bot as context", () => {
    assert.equal(classify(normalized({ text: "ok", replyToFromId: 999 }), BOT), CONTEXT);
  });

  it("never treats another bot as directing it, even when mentioned", () => {
    // The loop guard: bot-to-bot mentions must not become actionable work.
    const fromBot = normalized({ text: "@dev_finla_bot sunu yap", isBot: true });
    assert.equal(classify(fromBot, BOT), CONTEXT);
  });
});

describe("sender allowlist", () => {
  const normalized = (opts) => normalizeUpdate(update(opts));

  it("defaults to Kadri only", () => {
    assert.deepEqual(resolveDirectedUsernames({}), ["kadricaabuk"]);
  });

  it("reads a comma separated override and tolerates @ and spacing", () => {
    assert.deepEqual(
      resolveDirectedUsernames({ TELEGRAM_DIRECTED_USERNAMES: " @Kadricaabuk , someone " }),
      ["kadricaabuk", "someone"],
    );
  });

  it("falls back to the default rather than allowing everyone when blank", () => {
    assert.deepEqual(resolveDirectedUsernames({ TELEGRAM_DIRECTED_USERNAMES: "  ,  " }), ALLOWED);
  });

  it("rejects bots regardless of the allowlist", () => {
    assert.equal(isAllowedSender(normalized({ isBot: true }), ALLOWED), false);
    assert.equal(isAllowedSender(normalized({ isBot: true }), []), false);
  });

  it("keeps an unlisted human out of the directed bucket", () => {
    const stranger = normalized({ text: "@dev_finla_bot deploy et", username: "randomperson" });
    assert.equal(classify(stranger, { ...BOT, allowedUsernames: ALLOWED }), CONTEXT);
  });

  it("still lets the allowed human direct the agent", () => {
    const kadri = normalized({ text: "@dev_finla_bot deploy et" });
    assert.equal(classify(kadri, { ...BOT, allowedUsernames: ALLOWED }), DIRECTED);
  });
});

describe("buildInbox", () => {
  it("splits directed from context and reports the ack point", () => {
    const updates = [
      update({ text: "gunaydin" }),
      update({ text: "@dev_finla_bot PR acar misin" }),
      update({ text: "@dev_finla_bot ben de", isBot: true }),
    ];
    const inbox = buildInbox(updates, { ...BOT, chatId: CHAT_ID });

    assert.equal(inbox.directed.length, 1);
    assert.match(inbox.directed[0].text, /PR acar misin/);
    assert.equal(inbox.context.length, 2);
    assert.equal(inbox.lastUpdateId, updates[2].update_id);
  });

  it("advances the ack point past service events that carry no message", () => {
    // Promotions and joins arrive as my_chat_member and must still be acked,
    // otherwise the same batch is re-read forever.
    const message = update({ text: "selam" });
    const service = { update_id: message.update_id + 1, my_chat_member: { chat: { id: CHAT_ID } } };
    const inbox = buildInbox([message, service], { ...BOT, chatId: CHAT_ID });

    assert.equal(inbox.directed.length + inbox.context.length, 1);
    assert.equal(inbox.lastUpdateId, service.update_id);
  });

  it("ignores messages from other chats", () => {
    const inbox = buildInbox([update({ text: "@dev_finla_bot hi", chatId: -1 })], {
      ...BOT,
      chatId: CHAT_ID,
    });
    assert.deepEqual(inbox.directed, []);
    assert.deepEqual(inbox.context, []);
  });

  it("keeps every chat when no chat filter is given", () => {
    const inbox = buildInbox([update({ text: "@dev_finla_bot hi", chatId: -1 })], BOT);
    assert.equal(inbox.directed.length, 1);
  });

  it("handles an empty batch", () => {
    const inbox = buildInbox([], BOT);
    assert.deepEqual(inbox, { directed: [], context: [], lastUpdateId: null });
    assert.deepEqual(buildInbox(undefined, BOT).directed, []);
  });
});

describe("normalizeUpdate", () => {
  it("flattens a group message", () => {
    const message = normalizeUpdate(update({ text: "merhaba" }));
    assert.equal(message.chatId, CHAT_ID);
    assert.equal(message.text, "merhaba");
    assert.equal(message.fromUsername, "kadricaabuk");
    assert.equal(message.fromIsBot, false);
  });

  it("returns null for service-only updates", () => {
    assert.equal(normalizeUpdate({ update_id: 1, my_chat_member: {} }), null);
    assert.equal(normalizeUpdate({ update_id: 2 }), null);
  });

  it("falls back to a caption when there is no text", () => {
    const message = normalizeUpdate({
      update_id: 3,
      message: { message_id: 1, chat: { id: CHAT_ID }, from: { id: 1 }, caption: "ekran goruntusu" },
    });
    assert.equal(message.text, "ekran goruntusu");
  });
});
