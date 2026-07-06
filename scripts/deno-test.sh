#!/usr/bin/env bash
# Deno test runner: uses global `deno` when installed, otherwise `npx deno`.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ARGS=(test --no-check --node-modules-dir=none "$@")

if command -v deno >/dev/null 2>&1; then
  exec deno "${ARGS[@]}"
fi

exec npx --yes deno "${ARGS[@]}"
