/**
 * The Finla agent identities that post to the shared Telegram group.
 *
 * Each agent has its own Telegram bot, so messages appear in the group under
 * that agent's name and avatar. The bot token therefore selects the identity —
 * sending with the wrong token silently posts as the wrong agent, which is the
 * main failure mode this registry exists to prevent.
 */

export const GROUP_CHAT_ID_ENV = "TELEGRAM_FINLA_GROUP_CHAT_ID";

export const AGENTS = Object.freeze({
  cofounder: {
    label: "Co-founder",
    tokenEnv: "TELEGRAM_BOT_TOKEN_COFOUNDER",
  },
  "product-analyst": {
    label: "Product Analyst",
    tokenEnv: "TELEGRAM_BOT_TOKEN_PRODUCT_ANALYST",
  },
  muhasebeci: {
    label: "Muhasebeci",
    tokenEnv: "TELEGRAM_BOT_TOKEN_MUHASEBECI",
  },
  "pr-manager": {
    label: "PR Manager",
    tokenEnv: "TELEGRAM_BOT_TOKEN_PR_MANAGER",
  },
});

export function listAgentKeys() {
  return Object.keys(AGENTS);
}

export function resolveAgent(key) {
  const agent = AGENTS[key];
  if (!agent) {
    throw new Error(
      `Unknown agent "${key}". Expected one of: ${listAgentKeys().join(", ")}.`,
    );
  }
  return { key, ...agent };
}

/**
 * Reads one agent's bot token from the environment.
 *
 * The token is returned but never logged; callers must keep it out of output.
 * `sendMessage` puts the token in the request URL, so error paths have to
 * redact it explicitly.
 */
export function readAgentToken(key, env = process.env) {
  const agent = resolveAgent(key);
  const token = env[agent.tokenEnv];
  if (!token) {
    throw new Error(
      `${agent.tokenEnv} is not set, so the "${agent.label}" bot cannot send. Add it as a Runtime Secret; secrets are injected at VM boot, so a run started before the secret was saved will not see it.`,
    );
  }
  return token;
}

export function readGroupChatId(env = process.env) {
  const chatId = env[GROUP_CHAT_ID_ENV];
  if (!chatId) {
    throw new Error(
      `${GROUP_CHAT_ID_ENV} is not set. Use \`cli.mjs chat-id --agent <key>\` to discover it after the bot has been added to the group and mentioned once.`,
    );
  }
  return chatId;
}
