# Linear automation client

Deterministic Linear access for the **Finla — Linear development → PR** Cursor automation,
which picks up issues in the `Founder Tasks` project labelled `development`, opens a PR for
each, and reports back on the issue.

Cloud Agents cannot reach Linear on their own: a repo-committed `.cursor/mcp.json` is ignored
by cloud agents, and the only Linear tools otherwise available subscribe to future events
rather than reading or writing issues. This client closes that gap with a scoped API key.

The rules that decide *which* issues get worked on live in `select-issues.mjs` as pure
functions, so they are unit tested and reviewable rather than re-derived by a model each run.

## Setup

1. Create a Linear personal API key at
   [linear.app/settings/account/security](https://linear.app/settings/account/security)
   (Settings → Account → Security & Access → Personal API keys). The key starts with
   `lin_api_` and is shown only once.
   - Choose **Only select permissions…** and enable **Read + Write**. Leave **Admin** off.
     Write is required because the emoji protocol calls `reactionCreate`, which mutates the
     issue; the narrower "Create comments" permission does not cover it.
   - Restrict **Team access** to the Finla team.
   - Prefer generating the key from a dedicated Linear bot user rather than a personal
     account. Reactions and comments are attributed to the key's owner, and a stable bot
     identity makes the "did this automation already handle the issue" check an exact author
     match instead of a guess.
2. Add the key as a **Runtime Secret** named `LINEAR_API_KEY` in
   [Cloud Agents → Secrets](https://cursor.com/dashboard/cloud-agents). Runtime Secrets are
   redacted from transcripts, tool results, and commits.

Secrets are injected at VM boot, so an agent already running when the secret is saved will not
see it. Start a fresh run.

## Commands

```bash
node scripts/linear-automation/cli.mjs whoami
node scripts/linear-automation/cli.mjs list [--project "Founder Tasks"] [--label development] [--max 3]
node scripts/linear-automation/cli.mjs react <issueUuid> <seen|working|done>
node scripts/linear-automation/cli.mjs comment <issueUuid> <prUrl>
```

Every command prints JSON on stdout and exits non-zero with `{ "error": ... }` on failure.

`list` returns the issues to work on plus a `skipped` array explaining every rejection, which
is the first place to look when an issue you expected to be picked up was not.

Mutations take the issue **UUID** (the `id` field from `list`), not the `FIN-123` identifier.

### Emoji protocol

| Stage | Command | Linear shortcode |
| --- | --- | --- |
| Issue selected | `react <id> seen` | `eyes` 👀 |
| Implementation started | `react <id> working` | `arrows_counterclockwise` 🔄 |
| PR opened and linked | `react <id> done` | `white_check_mark` ✅ |

Re-reacting is treated as success, so a retried run is safe.

## Selection rules

`selectIssues` applies, in order:

1. **Scope** — must be in the `Founder Tasks` project and carry the `development` label.
   Both are matched case-insensitively on **both** sides: the GraphQL filter uses
   `eqIgnoreCase`, and the same predicates are re-checked client-side so a drifting query
   cannot silently widen scope.

   The server-side half matters more than it looks. Linear's `eq` is case sensitive, so a
   label stored as `Development` matched nothing against `development` and the API returned an
   empty list **with no error** — the client-side check never ran, because nothing came back
   to check. If `list` is ever empty again, run `doctor` rather than guessing.
2. **Open** — Linear state type must not be `completed` or `canceled`.
3. **Not already handled** — skipped if any comment contains a GitHub PR URL, or if the
   completion reaction is present from the bot user. PR-link detection ignores authorship on
   purpose: a human-linked PR still means the work exists, and a duplicate PR is more costly
   than a skipped run. The skip reason records who linked it.
4. **Severity order** — Urgent → High → Medium → Low. Linear encodes "no priority" as `0`,
   which would otherwise sort ahead of Urgent, so unprioritized issues are ranked last.
   Ties break on identifier so reruns agree.
5. **Run cap** — at most three issues per run.

## Tests

```bash
npm run test:linear
```

Uses the Node built-in test runner rather than `scripts/deno-test.sh`, which the repo's other
suites use. This code is a plain Node CLI executed by `node`, not Deno edge-function code, so
it is tested on the runtime it actually runs on. (Deno is reachable here — `deno-test.sh`
falls back to `npx deno` when it is not installed globally — so this is a deliberate choice,
not a workaround.)

No network access is required; the transport tests drive a stub `fetch`.

## Notes

Personal API keys authenticate with the key sent **raw** in the `Authorization` header, with
no `Bearer` prefix — `Bearer` applies to OAuth2 access tokens only. Rate limit is 1,500
requests/hour, far above what a three-issue run needs.

## End-of-run: Telegram status (required)

The Cursor automation that drives this client must finish every run with one Telegram
status in the FINLA group, as the `developer` identity — including when no issue was
selected or work was blocked:

```bash
node scripts/telegram/cli.mjs send --agent developer --status --text "..."
```

Plain text, no emoji, cite `FIN-123`, include PR URLs when PRs opened. Only one `--status`
send is allowed per run. Details: `scripts/telegram/README.md`.

The automation dashboard prompt must spell out this step; a run that only follows the
template and never opens this README can otherwise exit without messaging the group.
