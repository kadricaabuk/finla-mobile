import {
  getCachedInvoiceRowsForDirection,
  hydrateInvoiceCache,
  type CachedInvoiceRow,
} from "@/lib/invoices-cache";
import { getTokens } from "@/lib/session";
import { sortGibInvoicesByDate } from "@/lib/sort-gib-invoices";
import type { GIBInvoice } from "@/types/gib-invoice";
import type { Ionicons } from "@expo/vector-icons";
import { useEffect, useState, type ComponentProps } from "react";

export type ExamplePrompt = {
  icon: ComponentProps<typeof Ionicons>["name"];
  text: string;
};

// Boş sohbet: finla'nın gerçek fiilleri — dokununca mesaj olarak gönderilir.
const STATIC_EXAMPLE_PROMPTS: readonly ExamplePrompt[] = [
  {
    icon: "document-text-outline",
    text: "Yılmaz İnşaat'a 10.000 TL + KDV fatura kes",
  },
  { icon: "albums-outline", text: "Bu ay kestiğim faturaları göster" },
  { icon: "mail-open-outline", text: "Gelen son faturaları listele" },
  { icon: "download-outline", text: "Geçen ayın faturalarını Excel'e dök" },
];

const MAX_PERSONALIZED_PROMPTS = 2;

/** En son kesilen faturalardan tekrarsız 1-2 müşteri adı çıkarır. */
function extractRecentOutgoingCustomers(rows: CachedInvoiceRow[]): string[] {
  const sorted = sortGibInvoicesByDate(rows as GIBInvoice[]);
  const seen = new Set<string>();
  const names: string[] = [];
  for (const row of sorted) {
    const raw =
      typeof row.aliciUnvanAdSoyad === "string"
        ? row.aliciUnvanAdSoyad
        : typeof row.aliciUnvan === "string"
          ? row.aliciUnvan
          : "";
    const name = raw.trim();
    if (!name) continue;
    const dedupeKey = name.toLocaleLowerCase("tr-TR");
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    names.push(name);
    if (names.length >= MAX_PERSONALIZED_PROMPTS) break;
  }
  return names;
}

/**
 * Boş sohbet örnek istemleri. Fatura cache'inde giden fatura varsa ilk
 * örnek(ler) gerçek müşteri adlarıyla kişiselleştirilir ("{Müşteri} için
 * fatura kes"); cache boşsa statik liste kalır. Ağ çağrısı yapılmaz.
 */
export function useExamplePrompts(): readonly ExamplePrompt[] {
  const [prompts, setPrompts] = useState<readonly ExamplePrompt[]>(
    STATIC_EXAMPLE_PROMPTS,
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const tokens = await getTokens();
        if (!tokens) return;
        await hydrateInvoiceCache(tokens.accessToken);
        const rows = getCachedInvoiceRowsForDirection("outgoing");
        const customers = extractRecentOutgoingCustomers(rows);
        if (cancelled || customers.length === 0) return;
        const personalized: ExamplePrompt[] = customers.map((name) => ({
          icon: "document-text-outline",
          text: `${name} için fatura kes`,
        }));
        setPrompts([...personalized, ...STATIC_EXAMPLE_PROMPTS.slice(1)]);
      } catch {
        /* cache okunamazsa statik liste kalır */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return prompts;
}
