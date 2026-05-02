import { decodeJwtSub, getTokens } from "@/lib/session";
import { router } from "expo-router";
import { useEffect, useState } from "react";

/** Resolves once stored tokens are read; redirects to login when missing. */
export function useFinlaSession() {
  const [sessionLabel, setSessionLabel] = useState<string | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getTokens().then((tokens) => {
      if (cancelled) return;
      if (!tokens) {
        router.replace("/login");
        setSessionLabel(null);
        setBootstrapped(true);
        return;
      }
      setSessionLabel(decodeJwtSub(tokens.accessToken) ?? "Hesap");
      setBootstrapped(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { sessionLabel, bootstrapped };
}
