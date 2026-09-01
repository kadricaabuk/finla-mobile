# Local QA runner (Maestro + Linear + Telegram)

The scheduled QA loop lives here. It is **not** the in-session Cursor `qa` agent
(that one runs unit tests after a code change and ticks `QA.md`). This runner is
meant to execute on Kadri's Mac against a real simulator.

Mechanical work (pull, Maestro, Linear Result labels, one Telegram status) is a
script. Writing new Maestro flows, triaging Fail vs a product bug, and opening
Founder Tasks Bug issues stays a human-approved agent turn.

## Layout

| Path | Role |
| --- | --- |
| `scripts/qa-agent/catalog.mjs` | Persistent test cases (one Linear issue each) |
| `scripts/qa-agent/select-suite.mjs` | smoke+core every run; flow/feature rotate; `full` sweep |
| `scripts/qa-agent/linear-sync.mjs` | Result label swap + comment / Telegram body (pure) |
| `scripts/qa-agent/cli.mjs` | JSON CLI for Linear seed / list / report |
| `scripts/qa-agent/run.sh` | Orchestrator |
| `scripts/qa-agent/com.finla.qa-agent.plist.example` | launchd template — do not `launchctl load` until agreed |

Maestro YAML stays in `.maestro/flows/` so CI (`maestro-smoke`) and
`npm run maestro:*` keep working. New Flow/Feature files can get typed folders
later; do not move the existing six.

## One-time setup

1. **Worktree** (never `git pull` / `reset --hard` on the primary checkout):

   ```bash
   bash scripts/qa-agent/run.sh --init-worktree
   ```

   Default path: `~/Desktop/projects/finla-qa`. Override with `QA_WORKTREE`.
   This clone's GitHub remote is named `finla-mobile`, not `origin`; the runner
   picks `origin` when present, otherwise the first remote. Override with
   `QA_REMOTE`. The worktree uses a local branch `qa-sync` (Git will not check
   out `develop` in two worktrees at once) and resets it to remote develop
   on `--pull`. Do not push `qa-sync`.

2. **Secrets** in `~/.finla/qa.env` (create the directory; never commit this file):

   ```bash
   mkdir -p ~/.finla
   cat > ~/.finla/qa.env <<'EOF'
   export TELEGRAM_BOT_TOKEN_QA='…'
   export TELEGRAM_FINLA_GROUP_CHAT_ID='-1003716262054'
   export LINEAR_API_KEY='lin_api_…'
   EOF
   chmod 600 ~/.finla/qa.env
   ```

   Linear key: personal API key, Read + Write, Finla team only. Same shape as
   `scripts/linear-automation/README.md`. Comments and label updates are
   attributed to the key's owner.

3. **Telegram bot** `@qa_finla_bot` (or the username you created): admin in the
   FINLA group, Bot-to-Bot Communication Mode on if it must see other agents,
   and one `/start@qa_finla_bot` in the group so `getUpdates` can see the chat.
   Confirm without posting:

   ```bash
   set -a && source ~/.finla/qa.env && set +a
   node scripts/telegram/cli.mjs whoami --agent qa
   ```

4. **Maestro**: CLI installed, iOS simulator available, `.maestro/.env` with
   `TEST_PHONE` / `TEST_PIN`, app already installed on the simulator. This
   runner does **not** `expo prebuild` / `expo run:ios` on every tick (CI does
   that in `scripts/ci-maestro-ios.sh`). `--boot-simulator` only boots
   `MAESTRO_SIMULATOR` (default `iPhone 16`).

Flows use `clearState` **and** `clearKeychain`. iOS `clearState` wipes
AsyncStorage (onboarding flag) but leaves expo-secure-store tokens in the
Keychain, so the next launch can show onboarding while still being logged in.
`--run-tests` stops the suite after **two consecutive** Fail results; remaining
cases are not executed.

## Commands

```bash
node scripts/qa-agent/cli.mjs catalog
node scripts/qa-agent/cli.mjs suite --cadence smoke-core
node scripts/qa-agent/cli.mjs whoami
node scripts/qa-agent/cli.mjs list
node scripts/qa-agent/cli.mjs seed
bash scripts/qa-agent/run.sh                  # dry-run: print suite
bash scripts/qa-agent/run.sh --seed
bash scripts/qa-agent/run.sh --pull --suite smoke-core --boot-simulator --run-tests --report --telegram
```

`seed` is idempotent: it matches existing QA Automation issues by the
`**Maestro flow:** \`path\`` line in the description.

`--pull` refuses to run if `QA_WORKTREE` is the primary clone, not a linked
worktree.

`--telegram` sends **one** message via `scripts/telegram/cli.mjs send --agent qa --status`
(plain text, rate-limited). Bot messages in the group are context only; never
reply to another bot.

## Cadence

| Cadence | What runs |
| --- | --- |
| `smoke-core` (default) | Every smoke + core catalog entry |
| `rotate` | smoke + core, plus one flow and one feature when those exist |
| `full` | Entire catalog (weekly sweep) |

There are no Flow/Feature catalog entries yet. `rotate` currently equals
`smoke-core`.

## launchd

Copy `scripts/qa-agent/com.finla.qa-agent.plist.example` to
`~/Library/LaunchAgents/com.finla.qa-agent.plist`, fix paths if needed, then
**Kadri** loads it:

```bash
mkdir -p ~/.finla/qa
launchctl load ~/Library/LaunchAgents/com.finla.qa-agent.plist
```

Do not load this from an agent session. Default example: 10:00 and 16:00 local,
`smoke-core` only. Revisit after measuring wall-clock including simulator boot.

## Linear rules

- Project: QA Automation. Each issue is a test case, not a run.
- Exactly one Test Type label: Smoke, Core, Flow, or Feature Test.
- After a run, swap the Result label (Pass / Fail / Flaky) and comment with
  time, branch, commit, device, and Maestro log path.
- Product defects go to Founder Tasks with Bug, linked to the QA issue — not
  into QA Automation. Do not open those from the unattended runner.
- Do not create label groups or project settings. Ask Co-founder / Kadri.
