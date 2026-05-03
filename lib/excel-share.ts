/**
 * Expo SDK 54+: `cacheDirectory` / `downloadAsync` live under `expo-file-system/legacy`.
 * Importing them from `expo-file-system` leaves them undefined → "Dosya önbelleği kullanılamıyor."
 */
import {
  cacheDirectory,
  documentDirectory,
  downloadAsync,
} from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

/** Supabase yerel/production gateway kökü — imzayı `kong` yerine bununla uyumlu yaparız. */
function supabaseGatewayOriginFromEnv(): string | null {
  const tries = [
    process.env.EXPO_PUBLIC_API_BASE_URL,
    process.env.EXPO_PUBLIC_SUPABASE_URL,
  ];
  for (const rawUntrimmed of tries) {
    const raw = (rawUntrimmed ?? "").trim();
    if (!raw) continue;
    const collapsed = raw.replace(/\/$/, "").toLowerCase();
    const marker = collapsed.indexOf("/functions/");
    const base =
      marker > 0
        ? raw.slice(0, marker).replace(/\/$/, "")
        : raw.replace(/\/$/, "");
    try {
      const u = new URL(base.endsWith("/") ? base.slice(0, -1) : base);
      return `${u.protocol}//${u.host}`;
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * Yerel Supabase edge `createSignedUrl` bazen iç Docker host'u döner (`kong:8000`);
 * fiziksel cihaz bunu DNS'te çözemez. Uygulamanın kullandığı gateway köküyle origin değiştir.
 */
export function rewriteStorageSignedUrlForDevice(signedUrl: string): string {
  try {
    const u = new URL(signedUrl);
    const internal =
      u.hostname.toLowerCase() === "kong" ||
      /^kong\./i.test(u.hostname) ||
      /^supabase.*kong/i.test(u.hostname);
    if (!internal) return signedUrl;

    const target = supabaseGatewayOriginFromEnv();
    if (!target) return signedUrl;

    const origin = new URL(target.endsWith("/") ? target.slice(0, -1) : target);
    u.protocol = origin.protocol;
    u.host = origin.host;
    return u.toString();
  } catch {
    return signedUrl;
  }
}

function safeExcelFileName(name: string): string {
  const trimmed = name.trim() || "finla-export.xlsx";
  const noPath = trimmed.replace(/^.*[/\\]/, "").replace(/\s+/g, "-");
  const safe = noPath.replace(/[^a-zA-Z0-9._-ğüşıöçĞÜŞİÖÇ]/g, "_").slice(0, 96);
  const withExt = /\.xlsx$/i.test(safe)
    ? safe
    : `${safe.replace(/\.xls$/i, "")}.xlsx`;
  return withExt.length > 0 ? withExt : "finla-export.xlsx";
}

/**
 * Downloads a signed .xlsx URL to cache and opens the native share sheet.
 */
export async function shareExcelDownload(
  signedUrl: string,
  preferredFileName: string,
): Promise<{ ok: true; localUri: string } | { ok: false; message: string }> {
  try {
    const urlToFetch = rewriteStorageSignedUrlForDevice(signedUrl);
    const baseDir =
      (typeof cacheDirectory === "string" && cacheDirectory.length > 0
        ? cacheDirectory
        : null) ??
      (typeof documentDirectory === "string" && documentDirectory.length > 0
        ? documentDirectory
        : null) ??
      "";
    if (!baseDir) {
      return {
        ok: false,
        message: "Dosya konumu kullanılamıyor (henüz yüklendi mi kontrol et).",
      };
    }

    const fileName = safeExcelFileName(preferredFileName);
    const destination = `${baseDir}${fileName}`;

    const result = await downloadAsync(urlToFetch, destination);
    const localUri =
      typeof result.uri === "string" && result.uri.length > 0
        ? result.uri
        : destination;

    if (!(await Sharing.isAvailableAsync())) {
      return {
        ok: false,
        message:
          "Bu cihazda paylaşım kullanılamıyor; bağlantıyı başka yerde açmayı dene.",
      };
    }

    await Sharing.shareAsync(localUri, {
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      dialogTitle: "Excel çıktısını paylaş",
      UTI: "org.openxmlformats.spreadsheetml.sheet",
    });

    return { ok: true, localUri };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      message:
        detail.length > 0
          ? `İndirilemedi: ${detail}`
          : "Excel indirilemedi. Bağlantı süresi dolmuş olabilir; yeniden iste.",
    };
  }
}
