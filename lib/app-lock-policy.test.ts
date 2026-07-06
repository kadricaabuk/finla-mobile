import {
  assert,
  assertEquals,
  assertFalse,
} from "jsr:@std/assert";
import {
  computeNeedsUnlock,
  resolveColdStartLockState,
  resolvePostLoginRoute,
  resolveRefreshSessionLockState,
  shouldClearBiometricOnPinFallbackReauth,
  shouldClearBiometricOnSetupDecline,
  shouldDisableBiometricOnUnlockError,
  shouldRedirectToUnlock,
  shouldSkipLoginPathRefresh,
} from "./app-lock-policy.ts";

Deno.test("resolveRefreshSessionLockState — oturum yok", () => {
  assertEquals(
    resolveRefreshSessionLockState({
      sessionActive: false,
      biometricEnabled: true,
      pinFallbackActive: false,
    }),
    { biometricEnabled: false, isUnlocked: true },
  );
});

Deno.test("resolveRefreshSessionLockState — stale biometric, normal", () => {
  assertEquals(
    resolveRefreshSessionLockState({
      sessionActive: true,
      biometricEnabled: true,
      pinFallbackActive: false,
    }),
    { biometricEnabled: true, isUnlocked: false },
  );
});

Deno.test("resolveRefreshSessionLockState — PIN fallback kilitlemez", () => {
  assertEquals(
    resolveRefreshSessionLockState({
      sessionActive: true,
      biometricEnabled: true,
      pinFallbackActive: true,
    }),
    { biometricEnabled: true, isUnlocked: true },
  );
});

Deno.test("computeNeedsUnlock — PIN fallback aktifken false", () => {
  assertFalse(
    computeNeedsUnlock({
      ready: true,
      hasSession: true,
      biometricEnabled: true,
      isUnlocked: false,
      pinFallbackActive: true,
    }),
  );
});

Deno.test("computeNeedsUnlock — kilitli oturum", () => {
  assert(
    computeNeedsUnlock({
      ready: true,
      hasSession: true,
      biometricEnabled: true,
      isUnlocked: false,
      pinFallbackActive: false,
    }),
  );
});

Deno.test("shouldRedirectToUnlock — /login üzerinden yönlendirme yok", () => {
  assertFalse(
    shouldRedirectToUnlock({ needsUnlock: true, pathname: "/login" }),
  );
});

Deno.test("shouldRedirectToUnlock — ana ekrandan /unlock", () => {
  assert(
    shouldRedirectToUnlock({ needsUnlock: true, pathname: "/" }),
  );
});

Deno.test("shouldSkipLoginPathRefresh — PIN fallback sırasında atla", () => {
  assert(
    shouldSkipLoginPathRefresh({
      ready: true,
      pathname: "/login",
      pinFallbackActive: true,
    }),
  );
});

Deno.test("shouldSkipLoginPathRefresh — normal login yenile", () => {
  assertFalse(
    shouldSkipLoginPathRefresh({
      ready: true,
      pathname: "/login",
      pinFallbackActive: false,
    }),
  );
});

Deno.test("resolveColdStartLockState — stale enabled, verified false", () => {
  assertEquals(
    resolveColdStartLockState({ enabled: true, verified: false }),
    { biometricEnabled: true, isUnlocked: false },
  );
});

Deno.test("resolveColdStartLockState — biometric kapalı", () => {
  assertEquals(
    resolveColdStartLockState({ enabled: false, verified: false }),
    { biometricEnabled: false, isUnlocked: true },
  );
});

Deno.test("resolvePostLoginRoute — doğrulanmamış kurulum", () => {
  assertEquals(
    resolvePostLoginRoute({ enabled: true, verified: false }),
    "/unlock",
  );
});

Deno.test("resolvePostLoginRoute — kurulum yok veya doğrulandı", () => {
  assertEquals(
    resolvePostLoginRoute({ enabled: false, verified: false }),
    "/",
  );
  assertEquals(
    resolvePostLoginRoute({ enabled: true, verified: true }),
    "/",
  );
});

Deno.test("shouldClearBiometricOnSetupDecline", () => {
  assert(shouldClearBiometricOnSetupDecline({ enabled: false, verified: false }));
  assertFalse(shouldClearBiometricOnSetupDecline({ enabled: true, verified: true }));
});

Deno.test("shouldDisableBiometricOnUnlockError — not_available", () => {
  assert(shouldDisableBiometricOnUnlockError("not_available"));
  assertFalse(shouldDisableBiometricOnUnlockError("user_cancel"));
  assertFalse(shouldDisableBiometricOnUnlockError(undefined));
});

Deno.test("shouldClearBiometricOnPinFallbackReauth", () => {
  assert(shouldClearBiometricOnPinFallbackReauth());
});

/** Reinstall + permission denied senaryosu (loglardan türetilmiş). */
Deno.test("reinstall stale biometric — login fallback döngüsü kırılır", () => {
  const staleEnabled = true;

  const onLoginAfterUnlock = resolveRefreshSessionLockState({
    sessionActive: true,
    biometricEnabled: staleEnabled,
    pinFallbackActive: true,
  });
  assertEquals(onLoginAfterUnlock.isUnlocked, true);

  assertFalse(
    shouldRedirectToUnlock({ needsUnlock: false, pathname: "/login" }),
  );
  assert(
    shouldSkipLoginPathRefresh({
      ready: true,
      pathname: "/login",
      pinFallbackActive: true,
    }),
  );

  assert(shouldDisableBiometricOnUnlockError("not_available"));
  assert(shouldClearBiometricOnPinFallbackReauth());

  const afterPinLogin = resolvePostLoginRoute({
    enabled: false,
    verified: false,
  });
  assertEquals(afterPinLogin, "/");
});
