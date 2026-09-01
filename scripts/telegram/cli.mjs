#!/usr/bin/env node
/**
 * CLI for posting to the shared Finla Telegram group under a specific agent
 * identity. Every command prints JSON on stdout so an agent can consume it.
 *
 * Usage:
 *   node scripts/telegram/cli.mjs list-agents
 *   node scripts/telegram/cli.mjs whoami --agent product-analyst
 *   node scripts/telegram/cli.mjs chat-id --agent product-analyst
 *   node scripts/telegram/cli.mjs send --agent product-analyst --text "..."
 *   ... | node scripts/telegram/cli.mjs send --agent muhasebeci --stdin
 *
 * Text longer than Telegram's 4096-character limit is split automatically.
 */

import { readFile } from "node:fs/promises";

import {
  AGENTS,
  GROUP_CHAT_ID_ENV,
  listAgentKeys,
  readAgentToken,
  readGroupChatId,
  resolveAgent,
} from "./agents.mjs";
import { buildInbox } from "./inbox.mjs";
import { createTelegramClient, extractChats } from "./telegram-client.mjs";

const PARSE_MODES = {
  plain: null,
  html: "HTML",
  "markdown-v2": "MarkdownV2",
};

function parseFlags(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const name = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      flags[name] = true;
    } else {
      flags[name] = next;
      i += 1;
    }
  }
  return { flags, positional };
}

async function readStdin() {
  const parts = [];
  for await (const part of process.stdin) parts.push(part);
  return Buffer.concat(parts).toString("utf8");
}

async function resolveText(flags) {
  if (typeof flags.text === "string") return flags.text;
  if (typeof flags.file === "string") return readFile(flags.file, "utf8");
  if (flags.stdin) return readStdin();
  throw new Error("No message text. Pass --text <string>, --file <path>, or --stdin.");
}

function clientFor(agentKey) {
  return createTelegramClient({ token: readAgentToken(agentKey) });
}

function requireAgent(flags) {
  if (typeof flags.agent !== "string") {
    throw new Error(`--agent is required. Expected one of: ${listAgentKeys().join(", ")}.`);
  }
  return resolveAgent(flags.agent);
}

async function commandListAgents() {
  return {
    agents: Object.entries(AGENTS).map(([key, agent]) => ({
      key,
      label: agent.label,
      tokenEnv: agent.tokenEnv,
      tokenPresent: Boolean(process.env[agent.tokenEnv]),
    })),
  };
}

async function commandWhoami(flags) {
  const agent = requireAgent(flags);
  const me = await clientFor(agent.key).getMe();
  return {
    agent: agent.key,
    expectedLabel: agent.label,
    botId: me?.id ?? null,
    botUsername: me?.username ?? null,
    botName: me?.first_name ?? null,
    canReadAllGroupMessages: me?.can_read_all_group_messages ?? null,
  };
}

async function commandChatId(flags) {
  const agent = requireAgent(flags);
  const updates = await clientFor(agent.key).getUpdates();
  const chats = extractChats(updates);
  return {
    agent: agent.key,
    chats,
    hint:
      chats.length === 0
        ? "No chats visible. A privacy-mode bot receives only commands addressed to it, replies to its own messages, and service messages -- a plain @mention does NOT reach it. Send `/start@<bot_username>` in the group, or reply to one of the bot's messages, then retry. To receive every message instead, promote the bot to group admin."
        : `Set ${GROUP_CHAT_ID_ENV} to the id of the FINLA group.`,
  };
}

async function commandInbox(flags) {
  const agent = requireAgent(flags);
  const client = clientFor(agent.key);
  const chatId = typeof flags.chat === "string" ? flags.chat : process.env[GROUP_CHAT_ID_ENV] ?? null;

  const me = await client.getMe();
  const updates = await client.getUpdates({ limit: 100 });
  const { directed, context, lastUpdateId } = buildInbox(updates, {
    botUsername: me?.username,
    botId: me?.id,
    chatId,
  });

  return {
    agent: agent.key,
    botUsername: me?.username ?? null,
    chatId,
    directed,
    context,
    lastUpdateId,
    ack:
      lastUpdateId === null
        ? null
        : `node scripts/telegram/cli.mjs ack --agent ${agent.key} --through ${lastUpdateId}`,
  };
}

async function commandAck(flags) {
  const agent = requireAgent(flags);
  const through = Number(flags.through);
  if (!Number.isInteger(through)) {
    throw new Error("--through <updateId> is required and must be an integer.");
  }
  return { agent: agent.key, ...(await clientFor(agent.key).confirmUpdates(through)) };
}

async function commandSend(flags) {
  const agent = requireAgent(flags);
  const format = typeof flags.format === "string" ? flags.format : "plain";
  if (!(format in PARSE_MODES)) {
    throw new Error(
      `Unknown --format "${format}". Expected one of: ${Object.keys(PARSE_MODES).join(", ")}.`,
    );
  }

  // Resolve the identity's token first: it is the agent-specific requirement,
  // so reporting it before the shared chat id avoids a second round trip.
  const client = clientFor(agent.key);
  const chatId = typeof flags.chat === "string" ? flags.chat : readGroupChatId();
  const text = await resolveText(flags);

  const sent = await client.sendMessage({
    chatId,
    text,
    parseMode: PARSE_MODES[format],
  });

  return { agent: agent.key, label: agent.label, chatId, format, messages: sent };
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { flags } = parseFlags(rest);

  switch (command) {
    case "list-agents":
      return commandListAgents();
    case "whoami":
      return commandWhoami(flags);
    case "chat-id":
      return commandChatId(flags);
    case "inbox":
      return commandInbox(flags);
    case "ack":
      return commandAck(flags);
    case "send":
      return commandSend(flags);
    default:
      throw new Error(
        `Unknown command "${command ?? ""}". Expected one of: list-agents, whoami, chat-id, inbox, ack, send.`,
      );
  }
}

main()
  .then((result) => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  })
  .catch((error) => {
    process.stderr.write(`${JSON.stringify({ error: error.message }, null, 2)}\n`);
    process.exitCode = 1;
  });
