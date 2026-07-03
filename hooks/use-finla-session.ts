import { decodeJwtClaims, getTokens } from "@/lib/session";
import { router } from "expo-router";
import { useEffect, useState } from "react";

/** Resolves once stored tokens are read; redirects to login when missing. */
export function useFinlaSession() {
  const [sessionLabel, setSessionLabel] = useState<string | null>(null);
  const [onboardingCompleted, setOnboardingCompleted] = useState(true);
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getTokens().then((tokens) => {
      if (cancelled) return;
      if (!tokens) {
        router.replace("/login");
        setSessionLabel(null);
        setOnboardingCompleted(true);
        setBootstrapped(true);
        return;
      }
      const claims = decodeJwtClaims(tokens.accessToken);
      const label =
        claims?.tenant_name ??
        (claims?.phone
          ? `+${claims.phone.slice(0, 2)} ${claims.phone.slice(2)}`
          : null) ??
        "Hesap";
      setSessionLabel(label);
      setOnboardingCompleted(claims?.onboarding_completed === true);
      setBootstrapped(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { sessionLabel, bootstrapped, onboardingCompleted };
}
