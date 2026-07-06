#!/usr/bin/env bash
# Build Finla for the iOS Simulator and run Maestro smoke.
# Intended for the self-hosted macOS GitHub Actions runner (or local dry-run).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SIMULATOR_NAME="${MAESTRO_SIMULATOR:-iPhone 16}"

if ! command -v maestro >/dev/null 2>&1; then
  echo "Maestro CLI not found. Install: brew install mobile-dev-inc/tap/maestro" >&2
  exit 1
fi

if ! command -v xcrun >/dev/null 2>&1; then
  echo "Xcode command-line tools not found." >&2
  exit 1
fi

if [[ ! -f .env.local ]]; then
  echo ".env.local missing — CI must write staging EXPO_PUBLIC_* values before this script runs." >&2
  exit 1
fi

if [[ -z "${TEST_PHONE:-}" || -z "${TEST_PIN:-}" ]]; then
  echo "TEST_PHONE and TEST_PIN must be set (Maestro login credentials for staging)." >&2
  exit 1
fi

echo "Booting simulator: ${SIMULATOR_NAME}"
xcrun simctl boot "$SIMULATOR_NAME" 2>/dev/null || true
open -a Simulator >/dev/null 2>&1 || true

echo "Generating native iOS project (ios/ is gitignored)…"
npx expo prebuild --platform ios --non-interactive

echo "Building and installing on simulator (Release — no Metro required)…"
npx expo run:ios \
  --configuration Release \
  --simulator "$SIMULATOR_NAME" \
  --non-interactive

echo "Running Maestro smoke…"
maestro test .maestro/flows/smoke.yaml \
  -e "TEST_PHONE=${TEST_PHONE}" \
  -e "TEST_PIN=${TEST_PIN}"
