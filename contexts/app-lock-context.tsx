import { SessionBootstrapPlaceholder } from "@/components/layout/session-bootstrap-placeholder";
import { logAuthLock } from "@/lib/auth-lock-dev-log";
import {
  computeNeedsUnlock,
  resolveColdStartLockState,
  resolveRefreshSessionLockState,
  shouldRedirectToUnlock,
  shouldSkipLoginPathRefresh,
} from "@/lib/app-lock-policy";
import {
  getBiometricEnabled,
  offerBiometricSetupOnColdStart,
} from "@/lib/biometric-auth";
import { clearLegacyCredentials, clearTokens, getTokens } from "@/lib/session";
import { releaseNativeSplash } from "@/lib/splash-handoff";
import { router, usePathname } from "expo-router";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

interface GoToPinLoginOptions {
  /** true: oturumu koru (Face ID limiti sonrası); false: çıkış yap */
  keepSession?: boolean;
}

interface AppLockContextValue {
  ready: boolean;
  hasSession: boolean;
  biometricEnabled: boolean;
  isUnlocked: boolean;
  unlock: () => void;
  goToPinLogin: (options?: GoToPinLoginOptions) => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AppLockContext = createContext<AppLockContextValue | null>(null);

let sessionRefreshHandler: (() => Promise<void>) | null = null;
let sessionUnlockHandler: (() => void) | null = null;
let pinFallbackHandler: (() => boolean) | null = null;

/** Login / kayıt sonrası oturum kilidini günceller. */
export async function refreshAppLockSession(): Promise<void> {
  await sessionRefreshHandler?.();
}

/** Face ID doğrulaması tamamlandığında kilidi açar. */
export function unlockAppLockSession(): void {
  sessionUnlockHandler?.();
}

/** Face ID limiti sonrası PIN ile giriş tamamlandıysa true döner (tek kullanımlık). */
export function consumePinFallbackReauth(): boolean {
  return pinFallbackHandler?.() ?? false;
}

export function AppLockProvider({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pinFallbackActive, setPinFallbackActive] = useState(false);

  // Native splash garantisi: unlock akışında placeholder onLayout'a
  // yetişemeyebilir; ready olduğunda splash mutlaka kapatılır (idempotent).
  useEffect(() => {
    if (!ready) return;
    void releaseNativeSplash();
  }, [ready]);

  const refreshSession = useCallback(async () => {
    const tokens = await getTokens();
    const sessionActive = !!tokens;
    logAuthLock("appLock.refreshSession.start", {
      sessionActive,
      pathname,
      pinFallbackActive,
    });

    setHasSession(sessionActive);

    if (!sessionActive) {
      const lock = resolveRefreshSessionLockState({
        sessionActive: false,
        biometricEnabled: false,
        pinFallbackActive,
      });
      setBiometricEnabled(lock.biometricEnabled);
      setIsUnlocked(lock.isUnlocked);
      logAuthLock("appLock.refreshSession.noSession", {
        isUnlocked: lock.isUnlocked,
      });
      return;
    }

    const enabled = await getBiometricEnabled();
    const lock = resolveRefreshSessionLockState({
      sessionActive: true,
      biometricEnabled: enabled,
      pinFallbackActive,
    });
    setBiometricEnabled(lock.biometricEnabled);
    setIsUnlocked(lock.isUnlocked);
    logAuthLock(
      pinFallbackActive
        ? "appLock.refreshSession.pinFallback"
        : "appLock.refreshSession.done",
      {
        biometricEnabled: lock.biometricEnabled,
        isUnlocked: lock.isUnlocked,
      },
    );
  }, [pathname, pinFallbackActive]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const tokens = await getTokens();
      if (cancelled) return;

      if (!tokens) {
        logAuthLock("appLock.bootstrap.noTokens");
        setHasSession(false);
        setBiometricEnabled(false);
        setIsUnlocked(true);
        setReady(true);
        return;
      }

      setHasSession(true);
      const setup = await offerBiometricSetupOnColdStart();
      if (cancelled) return;

      logAuthLock("appLock.bootstrap.withSession", {
        setupEnabled: setup.enabled,
        setupVerified: setup.verified,
        isUnlocked: resolveColdStartLockState(setup).isUnlocked,
      });
      const coldLock = resolveColdStartLockState(setup);
      setBiometricEnabled(coldLock.biometricEnabled);
      setIsUnlocked(coldLock.isUnlocked);
      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const unlock = useCallback(() => {
    logAuthLock("appLock.unlock");
    setPinFallbackActive(false);
    setIsUnlocked(true);
  }, []);

  const consumePinFallback = useCallback(() => {
    if (!pinFallbackActive) return false;
    logAuthLock("appLock.consumePinFallback");
    setPinFallbackActive(false);
    return true;
  }, [pinFallbackActive]);

  const goToPinLogin = useCallback(async (options?: GoToPinLoginOptions) => {
    logAuthLock("appLock.goToPinLogin", { keepSession: options?.keepSession });
    if (options?.keepSession) {
      setPinFallbackActive(true);
      setIsUnlocked(true);
      router.replace("/login");
      return;
    }
    await clearTokens();
    await clearLegacyCredentials();
    setPinFallbackActive(false);
    setHasSession(false);
    setIsUnlocked(true);
    router.replace("/login");
  }, []);

  // Modül seviyesindeki köprü fonksiyonlar (login ekranı buradan tetikler).
  // Not: bu effect unlock/consumePinFallback tanımlarından SONRA olmalı;
  // deps dizisi render sırasında değerlendirilir (TDZ).
  useEffect(() => {
    sessionRefreshHandler = refreshSession;
    sessionUnlockHandler = unlock;
    pinFallbackHandler = consumePinFallback;
    return () => {
      sessionRefreshHandler = null;
      sessionUnlockHandler = null;
      pinFallbackHandler = null;
    };
  }, [consumePinFallback, refreshSession, unlock]);

  const needsUnlock = computeNeedsUnlock({
    ready,
    hasSession,
    biometricEnabled,
    isUnlocked,
    pinFallbackActive,
  });

  useEffect(() => {
    if (
      !shouldRedirectToUnlock({ needsUnlock, pathname })
    ) {
      return;
    }
    logAuthLock("appLock.redirectUnlock", {
      pathname,
      hasSession,
      biometricEnabled,
      isUnlocked,
      pinFallbackActive,
    });
    router.replace("/unlock");
  }, [needsUnlock, pathname, hasSession, biometricEnabled, isUnlocked, pinFallbackActive]);

  useEffect(() => {
    if (
      shouldSkipLoginPathRefresh({ ready, pathname, pinFallbackActive })
    ) {
      if (ready && pathname === "/login" && pinFallbackActive) {
        logAuthLock("appLock.loginPathRefresh.skipped", { pinFallbackActive });
      }
      return;
    }
    logAuthLock("appLock.loginPathRefresh", { pathname });
    void refreshSession();
  }, [pathname, pinFallbackActive, ready, refreshSession]);

  // Arka plan gizlilik kapağı kök layout'taki PrivacyCover'da (native
  // modallar dahil); burada ayrıca overlay yönetilmez.
  const value = useMemo<AppLockContextValue>(
    () => ({
      ready,
      hasSession,
      biometricEnabled,
      isUnlocked,
      unlock,
      goToPinLogin,
      refreshSession,
    }),
    [
      biometricEnabled,
      goToPinLogin,
      hasSession,
      isUnlocked,
      ready,
      refreshSession,
      unlock,
    ],
  );

  if (!ready) {
    return <SessionBootstrapPlaceholder />;
  }

  return (
    <AppLockContext.Provider value={value}>
      {children}
    </AppLockContext.Provider>
  );
}

export function useAppLock(): AppLockContextValue {
  const ctx = useContext(AppLockContext);
  if (!ctx) {
    throw new Error("useAppLock must be used within AppLockProvider");
  }
  return ctx;
}
