import Constants from "expo-constants";
import { Platform } from "react-native";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "0.0.0.0"]);

function trimTrailingSlash(url: string): string {
  return url.replace(/\/$/, "");
}

function isLoopbackHostname(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname.toLowerCase());
}

/** `.env.local` içindeki 127.0.0.1 / localhost yerel Supabase gateway'i mi? */
export function isLocalLoopbackEnvUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    return isLoopbackHostname(new URL(trimmed).hostname);
  } catch {
    return false;
  }
}

function hostFromUri(uri: string): string | null {
  const withoutScheme = uri.includes("://") ? uri.split("://", 2)[1]! : uri;
  const hostPort = withoutScheme.split("/")[0] ?? "";
  const host = hostPort.split(":")[0]?.trim();
  return host && host.length > 0 ? host : null;
}

/** Metro bundler'ın kullandığı host (ör. 192.168.1.107:8081 → 192.168.1.107). */
function getMetroBundledHost(): string | null {
  const manifest = Constants.manifest as { debuggerHost?: string } | null;
  const manifest2 = Constants.manifest2 as
    | { extra?: { expoClient?: { hostUri?: string } } }
    | null
    | undefined;

  const candidates = [
    Constants.expoConfig?.hostUri,
    manifest2?.extra?.expoClient?.hostUri,
    manifest?.debuggerHost,
  ];

  for (const raw of candidates) {
    if (typeof raw !== "string" || raw.length === 0) continue;
    const host = hostFromUri(raw);
    if (host) return host;
  }
  return null;
}

/**
 * Yerel Supabase için cihaza ulaşılabilir host.
 * - Metro LAN IP verdiyse (fiziksel cihaz + çoğu emülatör): onu kullan
 * - Android emülatör + yalnızca loopback: 10.0.2.2 (host makine köprüsü)
 * - iOS simülatör: 127.0.0.1
 */
export function resolveLocalDevHost(): string {
  const metroHost = getMetroBundledHost();
  if (metroHost && !isLoopbackHostname(metroHost)) {
    return metroHost;
  }
  if (Platform.OS === "android") {
    return "10.0.2.2";
  }
  return "127.0.0.1";
}

function rewriteLoopbackHost(url: string, newHost: string): string {
  try {
    const parsed = new URL(url);
    if (!isLoopbackHostname(parsed.hostname)) return trimTrailingSlash(url);
    parsed.hostname = newHost;
    return trimTrailingSlash(parsed.toString());
  } catch {
    return trimTrailingSlash(url);
  }
}

export type ResolvedPublicApiUrls = {
  supabaseUrl: string;
  apiBaseUrl: string;
  /** __DEV__ + loopback env ise gerçek istek host'u */
  devHost?: string;
};

/**
 * EXPO_PUBLIC_* URL'lerini cihaza göre çözümler.
 * Production / hosted Supabase URL'leri olduğu gibi kalır.
 */
export function resolvePublicApiUrls(): ResolvedPublicApiUrls {
  const supabaseUrl = trimTrailingSlash(
    process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
  );
  const apiBaseUrl = trimTrailingSlash(
    process.env.EXPO_PUBLIC_API_BASE_URL ?? "",
  );

  if (!__DEV__ || !isLocalLoopbackEnvUrl(supabaseUrl)) {
    return { supabaseUrl, apiBaseUrl };
  }

  const devHost = resolveLocalDevHost();
  return {
    supabaseUrl: rewriteLoopbackHost(supabaseUrl, devHost),
    apiBaseUrl: rewriteLoopbackHost(apiBaseUrl, devHost),
    devHost,
  };
}
