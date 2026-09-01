import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AGENTS, listAgentKeys, readAgentToken, readGroupChatId, resolveAgent } from "./agents.mjs";
import { createTelegramClient, extractChats, TelegramApiError } from "./telegram-client.mjs";

const TOKEN = "123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw";
const CHAT_ID = "-1003716262054";

const ok = (result) => ({ ok: true, status: 200, json: async () => ({ ok: true, result }) });
const fail = (status, body) => ({ ok: false, status, json: async () => body });

function recordingFetch(responses) {
  const calls = [];
  const queue = [...responses];
  return {
    calls,
    fetchImpl: async (url, init) => {
      calls.push({ url, init, body: JSON.parse(init.body) });
      const next = queue.shift();
      if (next instanceof Error) throw next;
      return next;
    },
  };
}

const clientWith = (fetchImpl, overrides = {}) =>
  createTelegramClient({ token: TOKEN, fetchImpl, baseRetryMs: 0, ...overrides });

describe("agent registry", () => {
  it("covers every Finla identity, each with its own token env var", () => {
    assert.deepEqual(listAgentKeys().sort(), [
      "cofounder",
      "developer",
      "muhasebeci",
      "pr-manager",
      "product-analyst",
    ]);
    const envVars = Object.values(AGENTS).map((agent) => agent.tokenEnv);
    assert.equal(new Set(envVars).size, envVars.length, "token env vars must be distinct");
  });

  it("rejects an unknown agent by name", () => {
    assert.throws(() => resolveAgent("designer"), /Unknown agent "designer"/);
  });

  it("explains which variable is missing rather than failing opaquely", () => {
    assert.throws(
      () => readAgentToken("muhasebeci", {}),
      /TELEGRAM_BOT_TOKEN_MUHASEBECI is not set/,
    );
    assert.throws(() => readGroupChatId({}), /TELEGRAM_FINLA_GROUP_CHAT_ID is not set/);
  });

  it("accepts either accepted name for the dev agent token", () => {
    // The agent brief names it _DEV_AGENT; the role-name form matches the
    // other four. A mismatch here would look like a bot that cannot send.
    assert.equal(readAgentToken("developer", { TELEGRAM_BOT_TOKEN_DEV_AGENT: "a" }), "a");
    assert.equal(readAgentToken("developer", { TELEGRAM_BOT_TOKEN_DEVELOPER: "b" }), "b");
    assert.throws(() => readAgentToken("developer", {}), /TELEGRAM_BOT_TOKEN_DEV_AGENT/);
  });

  it("reads the token for the requested identity only", () => {
    const env = {
      TELEGRAM_BOT_TOKEN_COFOUNDER: "cofounder-token",
      TELEGRAM_BOT_TOKEN_MUHASEBECI: "muhasebeci-token",
    };
    assert.equal(readAgentToken("cofounder", env), "cofounder-token");
    assert.equal(readAgentToken("muhasebeci", env), "muhasebeci-token");
  });
});

describe("sendMessage", () => {
  it("posts to the token's own endpoint with the chat id", async () => {
    const { calls, fetchImpl } = recordingFetch([ok({ message_id: 11 })]);
    const sent = await clientWith(fetchImpl).sendMessage({ chatId: CHAT_ID, text: "merhaba" });

    assert.equal(calls[0].url, `https://api.telegram.org/bot${TOKEN}/sendMessage`);
    assert.equal(calls[0].body.chat_id, CHAT_ID);
    assert.equal(calls[0].body.text, "merhaba");
    assert.deepEqual(sent, [{ messageId: 11, chars: 7 }]);
  });

  it("omits parse_mode by default so plain text cannot fail to parse", async () => {
    const { calls, fetchImpl } = recordingFetch([ok({ message_id: 1 })]);
    await clientWith(fetchImpl).sendMessage({ chatId: CHAT_ID, text: "invoice-detail" });
    assert.equal("parse_mode" in calls[0].body, false);
  });

  it("sets parse_mode only when asked", async () => {
    const { calls, fetchImpl } = recordingFetch([ok({ message_id: 1 })]);
    await clientWith(fetchImpl).sendMessage({ chatId: CHAT_ID, text: "<b>x</b>", parseMode: "HTML" });
    assert.equal(calls[0].body.parse_mode, "HTML");
  });

  it("redacts a leaked bot token before it reaches the group", async () => {
    const { calls, fetchImpl } = recordingFetch([ok({ message_id: 1 })]);
    await clientWith(fetchImpl).sendMessage({
      chatId: CHAT_ID,
      text: `debug: using ${TOKEN}`,
    });
    assert.equal(calls[0].body.text, "debug: using [redacted]");
  });

  it("splits an over-long report into several messages", async () => {
    const { calls, fetchImpl } = recordingFetch([ok({ message_id: 1 }), ok({ message_id: 2 })]);
    const sent = await clientWith(fetchImpl).sendMessage({
      chatId: CHAT_ID,
      text: "aaaa\nbbbb\ncccc",
      limit: 10,
    });

    assert.equal(calls.length, 2);
    assert.equal(calls[0].body.text, "aaaa\nbbbb");
    assert.equal(calls[1].body.text, "cccc");
    assert.deepEqual(
      sent.map((m) => m.messageId),
      [1, 2],
    );
  });

  it("refuses an empty message and a missing chat id", async () => {
    const { fetchImpl } = recordingFetch([]);
    const client = clientWith(fetchImpl);
    await assert.rejects(client.sendMessage({ chatId: CHAT_ID, text: "   \n  \n" }), /empty/i);
    await assert.rejects(client.sendMessage({ chatId: "", text: "hi" }), /chatId is required/);
  });
});

describe("error handling", () => {
  it("never leaks the token, which lives in the request URL", async () => {
    const { fetchImpl } = recordingFetch([
      fail(401, { ok: false, error_code: 401, description: `Unauthorized for bot${TOKEN}` }),
    ]);
    await assert.rejects(clientWith(fetchImpl).getMe(), (error) => {
      assert.ok(error instanceof TelegramApiError);
      assert.doesNotMatch(error.message, /AAHdqTcv/);
      assert.match(error.message, /<bot_token>/);
      assert.equal(error.errorCode, 401);
      return true;
    });
  });

  it("does not retry a plain client error", async () => {
    const { calls, fetchImpl } = recordingFetch([
      fail(400, { ok: false, error_code: 400, description: "Bad Request: chat not found" }),
      ok({ message_id: 1 }),
    ]);
    await assert.rejects(
      clientWith(fetchImpl).sendMessage({ chatId: CHAT_ID, text: "hi" }),
      /chat not found/,
    );
    assert.equal(calls.length, 1);
  });
});

describe("flood control and retries", () => {
  it("honours Telegram's retry_after and then succeeds", async () => {
    const { calls, fetchImpl } = recordingFetch([
      fail(429, { ok: false, error_code: 429, description: "Too Many Requests", parameters: { retry_after: 0 } }),
      ok({ message_id: 5 }),
    ]);
    const sent = await clientWith(fetchImpl).sendMessage({ chatId: CHAT_ID, text: "hi" });
    assert.equal(calls.length, 2);
    assert.equal(sent[0].messageId, 5);
  });

  it("gives up rather than sleeping through an absurd flood wait", async () => {
    const { calls, fetchImpl } = recordingFetch([
      fail(429, {
        ok: false,
        error_code: 429,
        description: "Too Many Requests",
        parameters: { retry_after: 3600 },
      }),
    ]);
    await assert.rejects(clientWith(fetchImpl).sendMessage({ chatId: CHAT_ID, text: "hi" }));
    assert.equal(calls.length, 1);
  });

  it("retries a transient server error", async () => {
    const { calls, fetchImpl } = recordingFetch([fail(502, {}), ok({ message_id: 9 })]);
    await clientWith(fetchImpl).sendMessage({ chatId: CHAT_ID, text: "hi" });
    assert.equal(calls.length, 2);
  });
});

describe("extractChats", () => {
  it("collapses updates into distinct chats", () => {
    const chats = extractChats([
      { message: { chat: { id: -100, type: "supergroup", title: "FINLA" } } },
      { message: { chat: { id: -100, type: "supergroup", title: "FINLA" } } },
      { my_chat_member: { chat: { id: 42, type: "private", username: "kadri" } } },
      { some_other_update: true },
    ]);
    assert.deepEqual(chats, [
      { id: -100, type: "supergroup", title: "FINLA" },
      { id: 42, type: "private", title: "kadri" },
    ]);
  });

  it("tolerates empty or missing input", () => {
    assert.deepEqual(extractChats([]), []);
    assert.deepEqual(extractChats(undefined), []);
  });
});
