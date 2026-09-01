# Finla team bots — Telegram

Outbound Telegram messaging for the autonomous Finla agents. Each agent posts to the shared
**FINLA** group under its own bot identity, so the group shows "Product Analyst" or
"Muhasebeci" as the sender rather than one generic bot.

This replaces the Zapier-mediated flow with direct Bot API calls: no third party in the data
path, no per-task billing, no logic living in a UI outside version control.

## Identities

| Agent key | Shown as | Token env var |
| --- | --- | --- |
| `cofounder` | Co-founder | `TELEGRAM_BOT_TOKEN_COFOUNDER` |
| `developer` | Fullstack Developer | `TELEGRAM_BOT_TOKEN_DEVELOPER` |
| `product-analyst` | Product Analyst | `TELEGRAM_BOT_TOKEN_PRODUCT_ANALYST` |
| `muhasebeci` | Muhasebeci | `TELEGRAM_BOT_TOKEN_MUHASEBECI` |
| `pr-manager` | PR Manager | `TELEGRAM_BOT_TOKEN_PR_MANAGER` |

Plus `TELEGRAM_FINLA_GROUP_CHAT_ID` for the destination group.

The token *is* the identity. Sending with the wrong token posts as the wrong agent and nothing
will flag it, which is why the agent is selected by key here rather than by passing a raw
token around.

## Setup

1. Create one bot per identity via [@BotFather](https://t.me/BotFather) (`/newbot`), or read an
   existing token from `/mybots` → the bot → API Token.
2. Add every bot to the FINLA group.
3. **Send each bot a command in the group** — `/start@bot_username` — or reply to one of its
   messages, so the group shows up in `getUpdates`.

   A plain `@bot_username` mention does **not** work. Under Telegram's group privacy mode a bot
   receives only commands addressed to it, general commands when it sent the last message,
   inline messages, replies to its own messages, and service messages. Bare mentions are not on
   that list. This is a one-time manual step per bot and cannot be automated.

   Sending does not require any of this — only chat discovery and inbound do.
4. Add the five variables above as **Runtime Secrets** in
   [Cloud Agents → Secrets](https://cursor.com/dashboard/cloud-agents). Runtime Secrets are
   redacted from transcripts, tool results, and commits. Secrets are injected at VM boot, so an
   agent already running when they are saved will not see them.

Never commit a bot token. Anyone holding one can post as that agent.

## Commands

```bash
node scripts/telegram/cli.mjs list-agents
node scripts/telegram/cli.mjs whoami   --agent product-analyst
node scripts/telegram/cli.mjs chat-id  --agent product-analyst
node scripts/telegram/cli.mjs send     --agent product-analyst --text "Rapor hazir"
node scripts/telegram/cli.mjs send     --agent muhasebeci --file report.md
some-command | node scripts/telegram/cli.mjs send --agent cofounder --stdin
```

All output is JSON; failures exit non-zero with `{ "error": ... }`.

- `list-agents` also reports which token env vars are actually present — the fastest way to
  diagnose a misconfigured run.
- `whoami` calls `getMe`, confirming both that the token works and which bot it belongs to.
  Run it after wiring a new identity to be sure the mapping is not crossed.
- `chat-id` lists the chats that bot can currently see, for discovering the group id.
- `send` targets `TELEGRAM_FINLA_GROUP_CHAT_ID` unless `--chat <id>` overrides it.

## Formatting

`--format` accepts `plain` (default), `html`, or `markdown-v2`.

**Default to plain.** MarkdownV2 treats `_ * [ ] ( ) ~ \` > # + - = | { } . !` as markup and
rejects the whole message if any appears unescaped. A single hyphen in `invoice-detail` is
enough to fail the send — this is the parse error seen through Zapier.

If you need formatting, prefer `html`: it needs only `&`, `<` and `>` escaped, so generated
content survives it far more often. Both escapers are exported for callers building rich text:

```js
import { escapeHtml, escapeMarkdownV2 } from "./format.mjs";
```

## Behaviour worth knowing

- **Length.** Telegram caps a message at 4096 characters. Longer text is split automatically,
  preferring line boundaries so reports do not break mid-sentence.
- **Secret guard.** Outgoing text is scanned for bot-token-shaped strings and redacted before
  sending. A leaked token in a chat message cannot be recalled.
- **Errors never echo the token.** The token sits in the request URL, so error messages
  replace it with `<bot_token>`.
- **Flood control.** On HTTP 429 the client waits exactly as long as Telegram's `retry_after`
  says, and gives up rather than sleeping through a wait longer than 30 seconds.
- **Empty reports stay quiet.** Whitespace-only text is refused instead of posting a blank.

## Tests

```bash
npm run test:telegram
```

No network required; the transport tests drive a stub `fetch`.

## Scope

Outbound only. Nothing here reads the group or reacts to messages.

### If reading the group is added later

**A bot must see the messages first.** By default it does not. Two ways to change that:

- **Promote the bot to group admin.** Admins always receive every message, and the change
  takes effect immediately.
- **Disable privacy mode** in BotFather (`/mybots` → the bot → Bot Settings → Group Privacy →
  Turn off) **and then remove and re-add the bot to the group.** Telegram only applies the new
  setting on re-join, which is the step people miss.

**A polling agent does not need a relay.** A scheduled agent can call `getUpdates` during its
own run using nothing but the bot token. The relay is only required for *real-time* triggering,
because Telegram's `setWebhook` can attach only `X-Telegram-Bot-Api-Secret-Token` and cannot
send the `Authorization: Bearer` header Cursor's webhook trigger requires.

Polling has its own constraints. `getUpdates` and webhooks are mutually exclusive; Telegram
keeps undelivered updates for 24 hours; and confirming an offset **consumes** updates, so two
pollers sharing one bot token will steal each other's messages — give each reader its own bot.

Either way, an agent that both reads and posts needs a loop guard: dedupe on `update_id`, drop
messages where `from.is_bot` is true, and cap runs per hour. Neither Telegram nor Cursor
provides one.
