import { SessionBootstrapPlaceholder } from "@/components/layout/session-bootstrap-placeholder";
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
    setHasSession(sessionActive);

    if (!sessionActive) {
      setBiometricEnabled(false);
      setIsUnlocked(true);
      return;
    }

    const enabled = await getBiometricEnabled();
    setBiometricEnabled(enabled);
    setIsUnlocked(!enabled);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const tokens = await getTokens();
      if (cancelled) return;

      if (!tokens) {
        setHasSession(false);
        setBiometricEnabled(false);
        setIsUnlocked(true);
        setReady(true);
        return;
      }

      setHasSession(true);
      const setup = await offerBiometricSetupOnColdStart();
      if (cancelled) return;

      setBiometricEnabled(setup.enabled);
      setIsUnlocked(!setup.enabled || setup.verified);
      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const unlock = useCallback(() => {
    setPinFallbackActive(false);
    setIsUnlocked(true);
  }, []);

  const consumePinFallback = useCallback(() => {
    if (!pinFallbackActive) return false;
    setPinFallbackActive(false);
    return true;
  }, [pinFallbackActive]);

  const goToPinLogin = useCallback(async (options?: GoToPinLoginOptions) => {
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

  const needsUnlock =
    ready &&
    hasSession &&
    biometricEnabled &&
    !isUnlocked &&
    !pinFallbackActive;

  useEffect(() => {
    if (!needsUnlock) return;
    if (pathname === "/unlock") return;
    router.replace("/unlock");
  }, [needsUnlock, pathname]);

  useEffect(() => {
    if (!ready) return;
    if (pathname !== "/login") return;
    void refreshSession();
  }, [pathname, ready, refreshSession]);

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
