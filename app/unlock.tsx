import { FaceIdLockScreen } from "@/components/layout/face-id-lock-screen";
import { useAppLock } from "@/contexts/app-lock-context";
import {
  authenticateWithBiometric,
  getBiometricLabels,
} from "@/lib/biometric-auth";
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
      await redirectToPinLogin(true);
      return;
    }

    scanInFlightRef.current = true;

    try {
      const result = await authenticateWithBiometric();
      if (result.success) {
        attemptCountRef.current = 0;
        unlock();
        router.replace("/");
        return;
      }

      attemptCountRef.current += 1;

      if (attemptCountRef.current >= MAX_BIOMETRIC_ATTEMPTS) {
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
