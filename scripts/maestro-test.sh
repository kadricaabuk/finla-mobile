#!/usr/bin/env bash
# Run Maestro with optional .maestro/.env (TEST_PHONE, TEST_PIN).
#
# Maestro 2.6 treats --env as -e KEY=VALUE, not a dotenv path. Parse the file
# and pass each assignment as -e so local runs match CI (`-e TEST_PHONE=...`).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ARGS=(test)

append_dotenv() {
  local file="$1"
  local line key value
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%"${line##*[![:space:]]}"}"
    [[ -z "$line" || "$line" == \#* ]] && continue
    key="${line%%=*}"
    value="${line#*=}"
    [[ "$key" == "$line" ]] && continue
    key="${key%"${key##*[![:space:]]}"}"
    key="${key#"${key%%[![:space:]]*}"}"
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    if [[ "$value" == \"*\" && "$value" == *\" ]]; then
      value="${value:1:${#value}-2}"
    elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
      value="${value:1:${#value}-2}"
    fi
    ARGS+=(-e "${key}=${value}")
  done < "$file"
}

if [[ -f .maestro/.env ]]; then
  append_dotenv .maestro/.env
fi

if [[ -n "${MAESTRO_SIMULATOR:-}" ]]; then
  ARGS+=(--udid "$MAESTRO_SIMULATOR")
fi

ARGS+=("$@")
exec maestro "${ARGS[@]}"
