import { invalidateInvoiceCaches } from "@/lib/invoices-cache";
import { clearLegacyCredentials, clearTokens, getTokens } from "@/lib/session";
import { logoutRequest } from "@/lib/supabase";
import { router } from "expo-router";
import { useCallback } from "react";

export function useLogout() {
  return useCallback(async () => {
    const tokens = await getTokens();
    const accessTokenForCache = tokens?.accessToken ?? null;
    try {
      if (tokens) await logoutRequest(tokens.accessToken);
    } catch {
      // Non-critical — proceed with local logout regardless
    }
    await invalidateInvoiceCaches(accessTokenForCache);
    await clearTokens();
    await clearLegacyCredentials();
    router.replace("/login");
  }, []);
}
