import { getOnboardingSeen } from "@/lib/onboarding-local";
import { logAuthLock } from "@/lib/auth-lock-dev-log";
import { decodeJwtClaims, getTokens } from "@/lib/session";
import { router } from "expo-router";
import { useEffect, useState } from "react";

/**
 * Resolves the cold-start route. Shows the intro carousel before login when the
 * device hasn't seen it yet; otherwise redirects to login when no tokens exist.
 */
export function useFinlaSession() {
  const [sessionLabel, setSessionLabel] = useState<string | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getOnboardingSeen(), getTokens()]).then(
      ([onboardingSeen, tokens]) => {
        if (cancelled) return;
        logAuthLock("finlaSession.bootstrap", {
          onboardingSeen,
          hasTokens: !!tokens,
        });
        if (!onboardingSeen) {
          logAuthLock("finlaSession.redirect", { target: "/onboarding" });
          router.replace("/onboarding");
          setSessionLabel(null);
          setBootstrapped(true);
          return;
        }
        if (!tokens) {
          logAuthLock("finlaSession.redirect", { target: "/login" });
          router.replace("/login");
          setSessionLabel(null);
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
        setBootstrapped(true);
        logAuthLock("finlaSession.ready", { label });
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return { sessionLabel, bootstrapped };
}
