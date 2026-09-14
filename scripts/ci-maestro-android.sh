#!/usr/bin/env bash
# Build a release APK, boot the Android emulator and run Maestro flows.
# Intended for the self-hosted homelab runner (Intel Mac, 2 cores, 8 GB RAM):
# Gradle runs while the emulator is stopped so the two never compete for memory.
#
# Env:
#   MAESTRO_TEST_PHONE / MAESTRO_TEST_PIN  required; the Maestro CLI injects MAESTRO_* into flows
#   ANDROID_AVD     AVD to boot (default: test_emulator)
#   MAESTRO_FLOWS   flow file or directory (default: .maestro/flows/smoke.yaml)
#   ANDROID_HOME    SDK root (default: Homebrew android-commandlinetools)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

AVD="${ANDROID_AVD:-test_emulator}"
FLOWS="${MAESTRO_FLOWS:-.maestro/flows/smoke.yaml}"
export ANDROID_HOME="${ANDROID_HOME:-/usr/local/share/android-commandlinetools}"
ADB="$ANDROID_HOME/platform-tools/adb"
EMULATOR="$ANDROID_HOME/emulator/emulator"
LOG_DIR="${RUNNER_TEMP:-$ROOT/.maestro-ci}/maestro-android"
mkdir -p "$LOG_DIR"

fail() {
  echo "$*" >&2
  exit 1
}

command -v maestro >/dev/null 2>&1 || fail "Maestro CLI not found. Install: brew install mobile-dev-inc/tap/maestro"
command -v java >/dev/null 2>&1 || fail "Java not found (JDK 17 required)."
[[ -x "$ADB" && -x "$EMULATOR" ]] || fail "Android SDK not found at $ANDROID_HOME (set ANDROID_HOME)."
[[ -f .env ]] || fail ".env missing — CI must write staging EXPO_PUBLIC_* values before this script runs."
[[ -n "${MAESTRO_TEST_PHONE:-}" && -n "${MAESTRO_TEST_PIN:-}" ]] ||
  fail "MAESTRO_TEST_PHONE and MAESTRO_TEST_PIN must be set (Maestro login credentials for staging)."
"$EMULATOR" -list-avds | grep -qx "$AVD" ||
  fail "AVD '$AVD' not found. Available: $("$EMULATOR" -list-avds | tr '\n' ' ')"

stop_emulators() {
  local serial waited=0
  for serial in $("$ADB" devices | awk '/^emulator-[0-9]+/ {print $1}'); do
    "$ADB" -s "$serial" emu kill >/dev/null 2>&1 || true
  done
  while pgrep -f 'qemu-system.*-avd' >/dev/null && ((waited < 60)); do
    sleep 2
    waited=$((waited + 2))
  done
  pkill -f 'qemu-system.*-avd' 2>/dev/null || true
}

echo "Stopping running emulators (frees RAM for Gradle)…"
stop_emulators

echo "Generating native Android project (android/ is gitignored)…"
npx expo prebuild --platform android --clean --no-install

echo "Building release APK (x86_64 only — the emulator ABI)…"
(
  cd android
  ./gradlew assembleRelease \
    --no-daemon \
    --build-cache \
    -PreactNativeArchitectures=x86_64 \
    -Dorg.gradle.jvmargs="-Xmx3g -XX:MaxMetaspaceSize=512m" \
    -Dorg.gradle.workers.max=2
)

APK="$(find android/app/build/outputs/apk/release -name '*.apk' | head -n 1)"
[[ -n "$APK" ]] || fail "Release APK not found under android/app/build/outputs/apk/release."
echo "APK: $APK"

echo "Booting emulator '$AVD' (headless)…"
nohup "$EMULATOR" -avd "$AVD" -no-window -no-audio -no-boot-anim -no-snapshot-save \
  >"$LOG_DIR/emulator.log" 2>&1 &

"$ADB" wait-for-device
SERIAL="$("$ADB" devices | awk '/^emulator-[0-9]+\tdevice/ {print $1; exit}')"
[[ -n "$SERIAL" ]] || fail "Emulator did not come online (log: $LOG_DIR/emulator.log)."

booted=0
for _ in $(seq 1 150); do
  if [[ "$("$ADB" -s "$SERIAL" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == "1" ]]; then
    booted=1
    break
  fi
  sleep 4
done
((booted)) || fail "Emulator did not finish booting within 10 minutes (log: $LOG_DIR/emulator.log)."
echo "Emulator ready: $SERIAL"

"$ADB" -s "$SERIAL" shell input keyevent 82 >/dev/null 2>&1 || true
for scale in window_animation_scale transition_animation_scale animator_duration_scale; do
  "$ADB" -s "$SERIAL" shell settings put global "$scale" 0
done

echo "Installing APK…"
# A build signed with a different key (e.g. a local debug install) blocks `install -r`.
"$ADB" -s "$SERIAL" uninstall com.finla.app >/dev/null 2>&1 || true
"$ADB" -s "$SERIAL" install "$APK"

echo "Running Maestro: $FLOWS"
# MAESTRO_* env vars are injected into the flows by the Maestro CLI.
maestro --udid "$SERIAL" test "$FLOWS"
