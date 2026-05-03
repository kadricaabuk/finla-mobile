import { createClient } from "npm:@supabase/supabase-js";

export type FinlaFeatures = {
  outgoingInvoices: boolean;
  incomingInvoices: boolean;
  profile: boolean;
};

const DEFAULT_FEATURES: FinlaFeatures = {
  outgoingInvoices: false,
  incomingInvoices: false,
  profile: false,
};

const CACHE_TTL_MS = 60_000;

const KEY_MAP = {
  outgoing_invoices: "outgoingInvoices",
  incoming_invoices: "incomingInvoices",
  profile: "profile",
} as const satisfies Record<string, keyof FinlaFeatures>;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

let cachedFeatures: FinlaFeatures = { ...DEFAULT_FEATURES };
let cachedAtMs = 0;
let inFlightLoad: Promise<FinlaFeatures> | null = null;

function mapRowsToFeatures(
  rows: { key: string; enabled: boolean }[],
): FinlaFeatures {
  const next: FinlaFeatures = { ...DEFAULT_FEATURES };
  for (const row of rows) {
    const mapped = KEY_MAP[row.key as keyof typeof KEY_MAP];
    if (!mapped) continue;
    next[mapped] = Boolean(row.enabled);
  }
  return next;
}

async function loadFromDb(): Promise<FinlaFeatures> {
  const { data, error } = await supabase
    .from("feature_flags")
    .select("key,enabled");
  if (error) throw error;
  return mapRowsToFeatures(
    (data ?? []) as { key: string; enabled: boolean }[],
  );
}

export function featureFlags(): FinlaFeatures {
  return cachedFeatures;
}

export async function loadFeatureFlags(force = false): Promise<FinlaFeatures> {
  const now = Date.now();
  if (!force && cachedAtMs > 0 && now - cachedAtMs < CACHE_TTL_MS) {
    return cachedFeatures;
  }
  if (!inFlightLoad) {
    inFlightLoad = loadFromDb()
      .then((fresh) => {
        cachedFeatures = fresh;
        cachedAtMs = Date.now();
        return fresh;
      })
      .catch((_err) => {
        // Fail closed for safety: disabled features should not accidentally open.
        cachedFeatures = { ...DEFAULT_FEATURES };
        cachedAtMs = Date.now();
        return cachedFeatures;
      })
      .finally(() => {
        inFlightLoad = null;
      });
  }
  return inFlightLoad;
}
