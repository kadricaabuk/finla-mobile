#!/usr/bin/env bash
# Verifies that docs still match the codebase:
#   1. Every backtick-quoted repo path in the docs exists
#   2. Every `npm run <script>` mentioned in the docs exists in package.json
#   3. Every edge function listed in CLAUDE.md's architecture tree exists
# Run after moving/deleting files: npm run docs:check
set -euo pipefail

cd "$(dirname "$0")/.."

DOCS=(CLAUDE.md README.md QA.md)
for f in .claude/commands/*.md .claude/agents/*.md; do
  [ -e "$f" ] && DOCS+=("$f")
done

fail=0

# --- 1. Path references -----------------------------------------------------
# Collect backtick tokens, keep the ones that look like repo paths, skip
# placeholders (<>), globs (*), regexes (|), URLs, env files, and commands.
extract_tokens() {
  grep -hoE '`[^`]+`' "$@" 2>/dev/null | sed 's/^`//; s/`$//' | sort -u
}

looks_like_path() {
  local t="$1"
  case "$t" in
    *' '*|*'<'*|*'>'*|*'*'*|*'|'*|*'…'*|*'{'*) return 1 ;;
    http*|npm*|npx*|deno.land*|*.com*|*.dev*) return 1 ;;
    /*|*'"'*) return 1 ;;       # app routes (/login), slash commands, code snippets
    .env*|*/.env*) return 1 ;;  # gitignored; absent on fresh clones
  esac
  [[ "$t" == */* || "$t" =~ \.(ts|tsx|js|jsx|md|sh|json|yaml|yml|sql|patch|py)$ ]]
}

resolve_path() {
  local t="${1#@/}"  # @/ alias → repo root
  [ -e "$t" ] && return 0
  [ -e "supabase/functions/$t" ] && return 0
  # extensionless import-style refs (e.g. @/lib/supabase)
  [ -e "$t.ts" ] || [ -e "$t.tsx" ] && return 0
  # bare filename → search tracked files
  if [[ "$t" != */* ]]; then
    git ls-files | grep -q "/$t\$" && return 0
  fi
  return 1
}

while IFS= read -r token; do
  looks_like_path "$token" || continue
  if ! resolve_path "$token"; then
    echo "MISSING PATH: \`$token\` (referenced in docs)"
    fail=1
  fi
done < <(extract_tokens "${DOCS[@]}")

# --- 2. npm scripts ----------------------------------------------------------
while IFS= read -r name; do
  [[ "$name" == *: ]] && continue  # placeholder like `npm run maestro:<flow>`
  if ! node -e "const s=require('./package.json').scripts; process.exit(s && s['$name'] ? 0 : 1)"; then
    echo "MISSING NPM SCRIPT: \"$name\" (referenced in docs)"
    fail=1
  fi
done < <(grep -hoE 'npm run [A-Za-z0-9:_-]+' "${DOCS[@]}" 2>/dev/null | sed 's/^npm run //' | sort -u)

# --- 3. Edge functions in CLAUDE.md architecture tree ------------------------
while IFS= read -r fn; do
  if [ ! -d "supabase/functions/$fn" ]; then
    echo "MISSING EDGE FUNCTION: supabase/functions/$fn/ (listed in CLAUDE.md)"
    fail=1
  fi
done < <(grep -oE '^│   │   [├└]── [a-z_-]+/' CLAUDE.md | grep -oE '[a-z_-]+/$' | tr -d '/')

if [ "$fail" -ne 0 ]; then
  echo
  echo "docs:check failed — update the docs (and bump the 'Last verified' line in CLAUDE.md)."
  exit 1
fi
echo "docs:check OK — all doc references resolve."
