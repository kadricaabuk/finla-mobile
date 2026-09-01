#!/usr/bin/env bash
# Local QA runner: optional worktree pull, Maestro suite, Linear report, one Telegram status.
#
# Does not load launchd, does not rebuild the iOS app, and refuses --pull on the
# primary git checkout (Kadri's working tree). See scripts/qa-agent/README.md.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ORCHESTRATOR_ROOT="$ROOT"
cd "$ROOT"

QA_ENV_FILE="${QA_ENV_FILE:-$HOME/.finla/qa.env}"
QA_WORKTREE="${QA_WORKTREE:-$HOME/Desktop/projects/finla-qa}"
QA_STATE_DIR="${QA_STATE_DIR:-$HOME/.finla/qa}"
CADENCE="smoke-core"
DO_PULL=0
DO_INIT_WORKTREE=0
DO_SEED=0
DO_RUN_TESTS=0
DO_REPORT=0
DO_TELEGRAM=0
BOOT_SIMULATOR=0

usage() {
  cat <<'EOF'
Usage: bash scripts/qa-agent/run.sh [options]

  --init-worktree   Create $QA_WORKTREE (default ~/Desktop/projects/finla-qa) if missing
  --pull            git fetch + reset --hard <remote>/develop in the QA worktree only
  --seed            Create missing Linear test-case issues from the catalog
  --suite NAME      smoke-core (default) | rotate | full
  --run-tests       Run the selected Maestro flows (app must already be on the simulator)
  --boot-simulator  xcrun simctl boot $MAESTRO_SIMULATOR (default iPhone 16); does not rebuild
  --report          Write Result labels + run comments to Linear
  --telegram        Send one QA status message to the FINLA group
  --dry-run         Print the suite plan and exit (also the default when no action flags are set)
  -h, --help        Show this help

Env: QA_WORKTREE, QA_ENV_FILE (~/.finla/qa.env), QA_REMOTE (optional; default origin
     or the first configured remote), MAESTRO_SIMULATOR, LINEAR_API_KEY,
     TELEGRAM_BOT_TOKEN_QA, TELEGRAM_FINLA_GROUP_CHAT_ID.
     TELEGRAM_RUN_ID is set automatically (one Telegram status per invocation).
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --init-worktree) DO_INIT_WORKTREE=1 ;;
    --pull) DO_PULL=1 ;;
    --seed) DO_SEED=1 ;;
    --suite)
      CADENCE="${2:-}"
      if [[ -z "$CADENCE" ]]; then
        echo "--suite requires smoke-core | rotate | full" >&2
        exit 1
      fi
      shift
      ;;
    --run-tests) DO_RUN_TESTS=1 ;;
    --boot-simulator) BOOT_SIMULATOR=1 ;;
    --report) DO_REPORT=1 ;;
    --telegram) DO_TELEGRAM=1 ;;
    --dry-run) ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

if [[ -f "$QA_ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$QA_ENV_FILE"
  set +a
fi

ACTION=0
if (( DO_INIT_WORKTREE || DO_PULL || DO_SEED || DO_RUN_TESTS || DO_REPORT || DO_TELEGRAM )); then
  ACTION=1
fi

LOCK_FILE=""
RESULTS_FILE=""
cleanup() {
  if [[ -n "$LOCK_FILE" && -f "$LOCK_FILE" ]]; then
    local lock_pid
    lock_pid="$(cat "$LOCK_FILE" 2>/dev/null || true)"
    if [[ "$lock_pid" == "$$" ]]; then
      rm -f "$LOCK_FILE"
    fi
  fi
  if [[ -n "$RESULTS_FILE" && -f "$RESULTS_FILE" ]]; then
    rm -f "$RESULTS_FILE"
  fi
}
trap cleanup EXIT

acquire_run_lock() {
  mkdir -p "$QA_STATE_DIR"
  LOCK_FILE="$QA_STATE_DIR/run.lock"
  if [[ -f "$LOCK_FILE" ]]; then
    local old
    old="$(cat "$LOCK_FILE" 2>/dev/null || true)"
    if [[ "$old" =~ ^[0-9]+$ ]] && kill -0 "$old" 2>/dev/null; then
      echo "Another QA run is in progress (pid $old)." >&2
      LOCK_FILE=""
      exit 1
    fi
  fi
  printf '%s\n' "$$" > "$LOCK_FILE"
}

if (( ACTION == 1 )); then
  acquire_run_lock
  export TELEGRAM_RUN_ID="${TELEGRAM_RUN_ID:-$(uuidgen)}"
fi

is_primary_checkout() {
  local dir="$1"
  local git_dir common
  git_dir="$(git -C "$dir" rev-parse --absolute-git-dir)"
  common="$(git -C "$dir" rev-parse --git-common-dir)"
  if [[ "$common" != /* ]]; then
    common="$(cd "$dir/$common" && pwd)"
  else
    common="$(cd "$common" && pwd)"
  fi
  [[ "$git_dir" == "$common" ]]
}

# This clone's GitHub remote is `finla-mobile`, not `origin`. Prefer origin when
# it exists so a conventional fork still works; otherwise take the first remote.
resolve_remote() {
  local dir="$1"
  if [[ -n "${QA_REMOTE:-}" ]]; then
    printf '%s\n' "$QA_REMOTE"
    return
  fi
  if git -C "$dir" remote get-url origin >/dev/null 2>&1; then
    printf 'origin\n'
    return
  fi
  local first
  first="$(git -C "$dir" remote | head -1)"
  if [[ -z "$first" ]]; then
    echo "No git remote configured." >&2
    exit 1
  fi
  printf '%s\n' "$first"
}

init_worktree() {
  if [[ -d "$QA_WORKTREE/.git" || -f "$QA_WORKTREE/.git" ]]; then
    echo "QA worktree already exists at $QA_WORKTREE"
    return 0
  fi
  local remote
  remote="$(resolve_remote "$ROOT")"
  if git -C "$ROOT" fetch "$remote" develop; then
    # `develop` is already checked out in the primary tree; Git forbids the
    # same branch in two worktrees. qa-sync is local-only and reset each pull.
    git -C "$ROOT" worktree add -B qa-sync "$QA_WORKTREE" "$remote/develop"
  else
    echo "Fetch from $remote failed; creating worktree from local develop." >&2
    git -C "$ROOT" worktree add -B qa-sync "$QA_WORKTREE" develop
  fi
  echo "Created QA worktree at $QA_WORKTREE"
}

pull_worktree() {
  if [[ ! -d "$QA_WORKTREE" ]]; then
    echo "QA worktree missing at $QA_WORKTREE. Run with --init-worktree first." >&2
    exit 1
  fi
  if is_primary_checkout "$QA_WORKTREE"; then
    echo "Refusing --pull on the primary git checkout ($QA_WORKTREE). The QA runner must use a linked worktree so it cannot reset Kadri's working tree." >&2
    exit 1
  fi
  local remote
  remote="$(resolve_remote "$QA_WORKTREE")"
  git -C "$QA_WORKTREE" fetch "$remote" develop
  git -C "$QA_WORKTREE" checkout qa-sync
  git -C "$QA_WORKTREE" reset --hard "$remote/develop"
  echo "QA worktree now at $(git -C "$QA_WORKTREE" rev-parse --short HEAD) (qa-sync tracking $remote/develop)"
}

# Pipeline order is fixed (flag order on the command line does not matter):
# pull worktree → seed missing QA Automation issues → suite → tests → report → telegram.
# Seed must run after pull so catalog.mjs is current, and before report so a
# newly merged case has a Linear issue.

if (( DO_PULL )); then
  pull_worktree
  ROOT="$QA_WORKTREE"
  cd "$ROOT"
fi

CLI=(node "$ROOT/scripts/qa-agent/cli.mjs")

echo "Suite plan ($CADENCE):"
"${CLI[@]}" suite --cadence "$CADENCE"

if (( ACTION == 0 )); then
  exit 0
fi

if (( DO_SEED )); then
  "${CLI[@]}" seed
fi

if (( DO_RUN_TESTS || DO_REPORT || DO_TELEGRAM )); then
  RESULTS_FILE="$(mktemp -t finla-qa-results.XXXXXX)"
  "${CLI[@]}" suite --cadence "$CADENCE" | node --input-type=module -e '
    import { readFileSync, writeFileSync } from "node:fs";
    const suite = JSON.parse(readFileSync(0, "utf8"));
    writeFileSync(process.argv[1], JSON.stringify({
      cadence: suite.cadence,
      results: [],
      newTests: "none",
      refactors: "none",
      bugs: "none",
      cases: suite.cases,
    }, null, 2));
  ' "$RESULTS_FILE"
fi

boot_simulator() {
  local name="${MAESTRO_SIMULATOR:-iPhone 16}"
  if ! command -v xcrun >/dev/null 2>&1; then
    echo "xcrun not found; cannot boot simulator" >&2
    exit 1
  fi
  echo "Booting simulator: $name"
  xcrun simctl boot "$name" 2>/dev/null || true
  open -a Simulator >/dev/null 2>&1 || true
}

append_result() {
  local flow="$1"
  local title="$2"
  local result="$3"
  local error="${4:-}"
  local log_dir="${5:-}"
  TITLE="$title" FLOW="$flow" RESULT="$result" ERROR="$error" LOG_DIR="$log_dir" \
    node --input-type=module -e '
      import { readFileSync, writeFileSync } from "node:fs";
      const file = process.argv[1];
      const data = JSON.parse(readFileSync(file, "utf8"));
      data.results.push({
        flow: process.env.FLOW,
        title: process.env.TITLE,
        result: process.env.RESULT,
        error: process.env.ERROR || null,
        logDir: process.env.LOG_DIR || null,
      });
      writeFileSync(file, JSON.stringify(data, null, 2));
    ' "$RESULTS_FILE"
}

latest_maestro_log() {
  ls -td "$HOME/.maestro/tests"/*/ 2>/dev/null | head -1 || true
}

device_label() {
  local name="${MAESTRO_SIMULATOR:-iPhone 16}"
  echo "iOS Simulator ($name)"
}

if (( BOOT_SIMULATOR )); then
  boot_simulator
fi

if (( DO_TELEGRAM && ! DO_RUN_TESTS )); then
  echo "--telegram requires --run-tests so the status message lists real results." >&2
  exit 1
fi

if (( DO_RUN_TESTS )); then
  if ! command -v maestro >/dev/null 2>&1; then
    echo "Maestro CLI not found. Install: brew install mobile-dev-inc/tap/maestro" >&2
    exit 1
  fi

  BRANCH="$(git -C "$ROOT" rev-parse --abbrev-ref HEAD)"
  COMMIT="$(git -C "$ROOT" rev-parse HEAD)"
  DEVICE="$(device_label)"
  consecutive_fails=0

  while IFS=$'\t' read -r flow title; do
    echo "Running $flow"
    set +e
    bash "$ROOT/scripts/maestro-test.sh" "$flow"
    status=$?
    set -e
    log_dir="$(latest_maestro_log)"
    if [[ $status -eq 0 ]]; then
      consecutive_fails=0
      append_result "$flow" "$title" "Pass" "" "$log_dir"
      if (( DO_REPORT )); then
        "${CLI[@]}" report --flow "$flow" --result Pass \
          --branch "$BRANCH" --commit "$COMMIT" --device "$DEVICE" \
          --cadence "$CADENCE" --log-dir "$log_dir"
      fi
    else
      consecutive_fails=$((consecutive_fails + 1))
      append_result "$flow" "$title" "Fail" "maestro exit $status" "$log_dir"
      if (( DO_REPORT )); then
        "${CLI[@]}" report --flow "$flow" --result Fail \
          --branch "$BRANCH" --commit "$COMMIT" --device "$DEVICE" \
          --cadence "$CADENCE" --log-dir "$log_dir" \
          --error "maestro exit $status"
      fi
      if (( consecutive_fails >= 2 )); then
        echo "Stopping suite: 2 consecutive failures."
        EARLY_STOP="Stopped after 2 consecutive failures; remaining tests not run." \
          node --input-type=module -e '
            import { readFileSync, writeFileSync } from "node:fs";
            const file = process.argv[1];
            const data = JSON.parse(readFileSync(file, "utf8"));
            data.earlyStop = process.env.EARLY_STOP;
            writeFileSync(file, JSON.stringify(data, null, 2));
          ' "$RESULTS_FILE"
        break
      fi
    fi
  done < <(node --input-type=module -e '
    import { readFileSync } from "node:fs";
    const data = JSON.parse(readFileSync(process.argv[1], "utf8"));
    for (const row of data.cases) {
      process.stdout.write(`${row.flow}\t${row.title}\n`);
    }
  ' "$RESULTS_FILE")
elif (( DO_REPORT )); then
  echo "--report without --run-tests has nothing to write. Run tests first." >&2
  exit 1
fi

if (( DO_TELEGRAM )); then
  if [[ ! -f "$RESULTS_FILE" ]]; then
    echo "--telegram requires a suite (run with --run-tests, or a skip payload)." >&2
    exit 1
  fi
  BODY="$("${CLI[@]}" telegram-body --file "$RESULTS_FILE" | node --input-type=module -e '
    import { readFileSync } from "node:fs";
    const payload = JSON.parse(readFileSync(0, "utf8"));
    process.stdout.write(payload.text);
  ')"
  node "$ORCHESTRATOR_ROOT/scripts/telegram/cli.mjs" send --agent qa --status --text "$BODY"
fi
