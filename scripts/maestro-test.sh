#!/usr/bin/env bash
# Run Maestro with optional .maestro/.env (TEST_PHONE, TEST_PIN).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ARGS=(test "$@")
if [[ -f .maestro/.env ]]; then
  ARGS=(test --env .maestro/.env "$@")
fi

exec maestro "${ARGS[@]}"
