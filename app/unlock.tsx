import { FaceIdLockScreen } from "@/components/layout/face-id-lock-screen";
import { useAppLock } from "@/contexts/app-lock-context";
import {
  authenticateWithBiometric,
  getBiometricLabels,
  setBiometricEnabled,
} from "@/lib/biometric-auth";
import { shouldDisableBiometricOnUnlockError } from "@/lib/app-lock-policy";
import { logAuthLock } from "@/lib/auth-lock-dev-log";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

const MAX_BIOMETRIC_ATTEMPTS = 2;

export default function UnlockScreen() {
  const { unlock, goToPinLogin } = useAppLock();
  const [pinLoading, setPinLoading] = useState(false);
  const [scanningSubtitle, setScanningSubtitle] = useState(
    "Biyometrik doğrulama yapılıyor…",
  );
  const scanInFlightRef = useRef(false);
  const attemptCountRef = useRef(0);

  useEffect(() => {
    void getBiometricLabels().then((labels) => {
      setScanningSubtitle(labels.scanningSubtitle);
    });
  }, []);

  const redirectToPinLogin = useCallback(
    async (keepSession: boolean) => {
      setPinLoading(true);
      try {
        await goToPinLogin({ keepSession });
      } finally {
        setPinLoading(false);
      }
    },
    [goToPinLogin],
  );

  const runBiometricScan = useCallback(async () => {
    if (scanInFlightRef.current) return;

    if (attemptCountRef.current >= MAX_BIOMETRIC_ATTEMPTS) {
      logAuthLock("unlock.maxAttempts", {
        attempts: attemptCountRef.current,
        keepSession: true,
      });
      await redirectToPinLogin(true);
      return;
    }

    scanInFlightRef.current = true;

    try {
      const result = await authenticateWithBiometric();
      logAuthLock("unlock.scan", {
        attempt: attemptCountRef.current + 1,
        success: result.success,
        ...(result.success
          ? {}
          : { error: result.error, warning: result.warning }),
      });
      if (result.success) {
        attemptCountRef.current = 0;
        unlock();
        router.replace("/");
        return;
      }

      // İzin reddedildi / biyometri kullanılamıyor (reinstall sonrası stale flag).
      if (
        !result.success &&
        shouldDisableBiometricOnUnlockError(result.error)
      ) {
        logAuthLock("unlock.notAvailable", { disabling: true });
        await setBiometricEnabled(false);
        await redirectToPinLogin(true);
        return;
      }

      attemptCountRef.current += 1;

      if (attemptCountRef.current >= MAX_BIOMETRIC_ATTEMPTS) {
        logAuthLock("unlock.maxAttempts", {
          attempts: attemptCountRef.current,
          keepSession: true,
        });
        await redirectToPinLogin(true);
        return;
      }

      scanInFlightRef.current = false;
      void runBiometricScan();
    } finally {
      scanInFlightRef.current = false;
    }
  }, [redirectToPinLogin, unlock]);

  useEffect(() => {
    attemptCountRef.current = 0;
    void runBiometricScan();
  }, [runBiometricScan]);

  return (
    <FaceIdLockScreen
      subtitle={scanningSubtitle}
      scanning
      showPinButton
      onPinLogin={() => void redirectToPinLogin(false)}
      pinLoading={pinLoading}
    />
  );
}
