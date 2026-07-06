import AsyncStorage from "@react-native-async-storage/async-storage";
import { decodeJwtSub } from "@/lib/session";

const STORAGE_PREFIX = "finla_invoices_cache_v1";

/** Same TTL as previously in-memory-only — persistence survives process kill until this window ends. */
export const INVOICES_CACHE_TTL_MS = 5 * 60 * 1000;

export interface CachedInvoiceRow {
  ettn?: string;
  belgeNumarasi?: string;
  aliciVknTckn?: string;
  aliciUnvanAdSoyad?: string;
  belgeTarihi?: string;
  malhizmetToplamTutari?: string | number;
  vergilerDahilToplamTutar?: string | number;
  onayDurumu?: string;
  [key: string]: unknown;
}

export type InvoiceCacheEntry = { fetchedAt: number; data: CachedInvoiceRow[] };

const syncCache = new Map<string, InvoiceCacheEntry>();

/** Which JWT `sub` the in-memory Map was loaded for; `null` = not hydrated this session / cleared. */
let hydratedSub: string | null = null;

function storageKeyForSub(sub: string): string {
  return `${STORAGE_PREFIX}_${sub}`;
}

function pruneStaleFromMap(map: Map<string, InvoiceCacheEntry>): void {
  const now = Date.now();
  for (const [k, v] of map.entries()) {
    if (now - v.fetchedAt >= INVOICES_CACHE_TTL_MS) map.delete(k);
  }
}

function pruneStaleFromRecord(
  rec: Record<string, InvoiceCacheEntry>,
): Record<string, InvoiceCacheEntry> {
  const now = Date.now();
  const out: Record<string, InvoiceCacheEntry> = {};
  for (const [k, v] of Object.entries(rec)) {
    if (
      v &&
      typeof v.fetchedAt === "number" &&
      Array.isArray(v.data) &&
      now - v.fetchedAt < INVOICES_CACHE_TTL_MS
    ) {
      out[k] = v;
    }
  }
  return out;
}

export async function hydrateInvoiceCache(accessToken: string): Promise<void> {
  const sub = decodeJwtSub(accessToken) ?? "_";
  if (hydratedSub === sub) return;

  syncCache.clear();
  hydratedSub = sub;

  try {
    const raw = await AsyncStorage.getItem(storageKeyForSub(sub));
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, InvoiceCacheEntry>;
    const pruned = pruneStaleFromRecord(parsed);
    for (const [k, v] of Object.entries(pruned)) {
      syncCache.set(k, v);
    }
    if (Object.keys(pruned).length !== Object.keys(parsed).length) {
      await AsyncStorage.setItem(storageKeyForSub(sub), JSON.stringify(pruned));
    }
  } catch {
    /* ignore corrupt storage */
  }
}

export async function persistInvoiceCache(accessToken: string): Promise<void> {
  const sub = decodeJwtSub(accessToken) ?? "_";
  pruneStaleFromMap(syncCache);
  const obj = Object.fromEntries(syncCache.entries());
  try {
    await AsyncStorage.setItem(storageKeyForSub(sub), JSON.stringify(obj));
  } catch {
    /* quota / transient */
  }
}

export function getInvoiceCacheEntry(
  rangeKey: string,
): InvoiceCacheEntry | undefined {
  return syncCache.get(rangeKey);
}

/**
 * Bellekteki taze cache girişlerinden, verilen yöne ait tüm fatura satırlarını
 * (en yeni fetch edilen giriş önce) döndürür. Ağ çağrısı yapmaz; cache boşsa
 * boş dizi döner. Önce `hydrateInvoiceCache` çağrılmış olmalı.
 */
export function getCachedInvoiceRowsForDirection(
  direction: "outgoing" | "incoming",
): CachedInvoiceRow[] {
  pruneStaleFromMap(syncCache);
  const entries: InvoiceCacheEntry[] = [];
  for (const [key, entry] of syncCache.entries()) {
    if (key.startsWith(`${direction}|`)) entries.push(entry);
  }
  entries.sort((a, b) => b.fetchedAt - a.fetchedAt);
  return entries.flatMap((e) => e.data);
}

export async function putInvoiceCacheEntry(
  accessToken: string,
  rangeKey: string,
  data: CachedInvoiceRow[],
): Promise<void> {
  await hydrateInvoiceCache(accessToken);
  pruneStaleFromMap(syncCache);
  syncCache.set(rangeKey, { fetchedAt: Date.now(), data });
  await persistInvoiceCache(accessToken);
}

export async function invalidateInvoiceCacheEntry(
  accessToken: string,
  rangeKey: string,
): Promise<void> {
  await hydrateInvoiceCache(accessToken);
  syncCache.delete(rangeKey);
  await persistInvoiceCache(accessToken);
}
export async function invalidateInvoiceCaches(
  accessToken: string | null,
): Promise<void> {
  if (accessToken) {
    const sub = decodeJwtSub(accessToken) ?? "_";
    try {
      await AsyncStorage.removeItem(storageKeyForSub(sub));
    } catch {
      /* ignore */
    }
  }
  syncCache.clear();
  hydratedSub = null;
}
