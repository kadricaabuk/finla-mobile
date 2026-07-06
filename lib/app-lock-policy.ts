export type BiometricSetupResult = {
  enabled: boolean;
  verified: boolean;
};

export type AppLockSnapshot = {
  ready: boolean;
  hasSession: boolean;
  biometricEnabled: boolean;
  isUnlocked: boolean;
  pinFallbackActive: boolean;
};

/** Oturum yenilemede kilit durumu (PIN fallback sırasında tekrar kilitleme). */
export function resolveRefreshSessionLockState(input: {
  sessionActive: boolean;
  biometricEnabled: boolean;
  pinFallbackActive: boolean;
}): { biometricEnabled: boolean; isUnlocked: boolean } {
  if (!input.sessionActive) {
    return { biometricEnabled: false, isUnlocked: true };
  }
  if (input.pinFallbackActive) {
    return {
      biometricEnabled: input.biometricEnabled,
      isUnlocked: true,
    };
  }
  return {
    biometricEnabled: input.biometricEnabled,
    isUnlocked: !input.biometricEnabled,
  };
}

export function computeNeedsUnlock(state: AppLockSnapshot): boolean {
  return (
    state.ready &&
    state.hasSession &&
    state.biometricEnabled &&
    !state.isUnlocked &&
    !state.pinFallbackActive
  );
}

/** /unlock yönlendirmesi — /login ve /unlock hariç. */
export function shouldRedirectToUnlock(input: {
  needsUnlock: boolean;
  pathname: string;
}): boolean {
  if (!input.needsUnlock) return false;
  return input.pathname !== "/unlock" && input.pathname !== "/login";
}

/** Login ekranında oturum yenileme — PIN fallback sırasında atlanır. */
export function shouldSkipLoginPathRefresh(input: {
  ready: boolean;
  pathname: string;
  pinFallbackActive: boolean;
}): boolean {
  if (!input.ready) return true;
  if (input.pathname !== "/login") return true;
  return input.pinFallbackActive;
}

export function resolveColdStartLockState(
  setup: BiometricSetupResult,
): { biometricEnabled: boolean; isUnlocked: boolean } {
  return {
    biometricEnabled: setup.enabled,
    isUnlocked: !setup.enabled || setup.verified,
  };
}

/** Biyometri kurulumu sonrası hedef rota. */
export function resolvePostLoginRoute(
  setup: BiometricSetupResult,
): "/" | "/unlock" {
  return setup.enabled && !setup.verified ? "/unlock" : "/";
}

/** Kurulum başarısız / reddedildiğinde stale Keychain bayrağını temizle. */
export function shouldClearBiometricOnSetupDecline(
  setup: BiometricSetupResult,
): boolean {
  return !setup.enabled;
}

/** Unlock taramasında biyometri kullanılamıyorsa bayrağı sıfırla. */
export function shouldDisableBiometricOnUnlockError(
  error: string | undefined,
): boolean {
  return error === "not_available";
}

/** PIN fallback girişinde biyometri bayrağını temizle. */
export function shouldClearBiometricOnPinFallbackReauth(): boolean {
  return true;
}
