import { useDrawerChatNavigation } from "@/hooks/use-drawer-chat-navigation";
import {
  invoiceRangeForPreset,
  type InvoiceDatePreset,
  type InvoiceDateRange,
} from "@/lib/invoice-date-presets";
import {
  getInvoiceCacheEntry,
  hydrateInvoiceCache,
  invalidateInvoiceCacheEntry,
  INVOICES_CACHE_TTL_MS,
  putInvoiceCacheEntry,
} from "@/lib/invoices-cache";
import { sortGibInvoicesByDate } from "@/lib/sort-gib-invoices";
import { getTokens } from "@/lib/session";
import { callApi, userFacingApiError } from "@/lib/supabase";
import type { GIBInvoice } from "@/types/gib-invoice";
import type { InvoicesListResponse } from "@/types/api-responses";
import type { InvoiceListDirection } from "@/types/gib-invoice";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";

export type IncomingInboxActionResult = {
  invoiceUuid: string;
  status: "accepted" | "rejected";
  statusLabel?: string;
};

export type UseInvoicesScreenOptions = {
  direction?: InvoiceListDirection;
};

export function useInvoicesScreen(
  options: UseInvoicesScreenOptions = {},
) {
  const direction = options.direction ?? "outgoing";
  const { handleDrawerNewChat, handleDrawerOpenConversation } =
    useDrawerChatNavigation();

  const params = useLocalSearchParams<{
    startDate?: string;
    endDate?: string;
    customerName?: string;
    amountGte?: string;
    amountEq?: string;
    source?: string;
  }>();

  const [preset, setPreset] = useState<InvoiceDatePreset>("bu_ay");
  const [customRange, setCustomRange] = useState<InvoiceDateRange | null>(null);
  const [chatFilterInfoOpen, setChatFilterInfoOpen] = useState(false);
  const [chatFilters, setChatFilters] = useState<{
    customerName?: string;
    amountGte?: number;
    amountEq?: number;
  } | null>(null);
  const [invoices, setInvoices] = useState<GIBInvoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchInvoices = useCallback(
    async (
      p: InvoiceDatePreset,
      rangeOverride?: InvoiceDateRange,
      isRefresh = false,
    ) => {
      const tokens = await getTokens();
      if (!tokens) return;

      const range = rangeOverride ?? invoiceRangeForPreset(p);
      const cacheKey = `${direction}|${range.startDate}|${range.endDate}`;

      await hydrateInvoiceCache(tokens.accessToken);

      if (!isRefresh && !chatFilters) {
        const cached = getInvoiceCacheEntry(cacheKey);
        if (cached && Date.now() - cached.fetchedAt < INVOICES_CACHE_TTL_MS) {
          setInvoices(sortGibInvoicesByDate(cached.data as GIBInvoice[]));
          setError(null);
          return;
        }
      }

      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
        setInvoices([]);
      }
      setError(null);

      try {
        const res = await callApi<InvoicesListResponse>("invoices", {
          ...range,
          direction,
          customerName: chatFilters?.customerName,
          amountGte: chatFilters?.amountGte,
          amountEq: chatFilters?.amountEq,
        });
        if (res.error) throw new Error(res.error);
        const data = sortGibInvoicesByDate(res.invoices ?? []);
        setInvoices(data);
        if (!chatFilters)
          await putInvoiceCacheEntry(tokens.accessToken, cacheKey, data);
      } catch (err) {
        setError(userFacingApiError(err));
        setInvoices([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [chatFilters, direction],
  );

  const patchInvoiceOnayDurumu = useCallback(
    (invoiceUuid: string, onayDurumu: string) => {
      setInvoices((prev) =>
        sortGibInvoicesByDate(
          prev.map((inv) =>
            inv.ettn === invoiceUuid ? { ...inv, onayDurumu } : inv,
          ),
        ),
      );
    },
    [],
  );

  const afterIncomingInboxAction = useCallback(
    async (result: IncomingInboxActionResult) => {
      const label =
        result.statusLabel ??
        (result.status === "accepted" ? "Kabul" : "Red");
      patchInvoiceOnayDurumu(result.invoiceUuid, label);

      const tokens = await getTokens();
      if (tokens) {
        const range = customRange ?? invoiceRangeForPreset(preset);
        const cacheKey = `${direction}|${range.startDate}|${range.endDate}`;
        await invalidateInvoiceCacheEntry(tokens.accessToken, cacheKey);
      }

      await fetchInvoices(preset, customRange ?? undefined, true);
    },
    [patchInvoiceOnayDurumu, preset, customRange, direction, fetchInvoices],
  );

  useEffect(() => {
    if (
      typeof params.startDate === "string" &&
      typeof params.endDate === "string"
    ) {
      setCustomRange({ startDate: params.startDate, endDate: params.endDate });
    }
    const hasChatFilter =
      typeof params.customerName === "string" ||
      typeof params.amountGte === "string" ||
      typeof params.amountEq === "string";
    if (hasChatFilter) {
      setChatFilters({
        customerName:
          typeof params.customerName === "string"
            ? params.customerName
            : undefined,
        amountGte:
          typeof params.amountGte === "string"
            ? Number(params.amountGte)
            : undefined,
        amountEq:
          typeof params.amountEq === "string"
            ? Number(params.amountEq)
            : undefined,
      });
    } else {
      setChatFilters(null);
    }
  }, [
    params.startDate,
    params.endDate,
    params.customerName,
    params.amountGte,
    params.amountEq,
  ]);

  useEffect(() => {
    void fetchInvoices(preset, customRange ?? undefined);
  }, [preset, customRange, fetchInvoices]);

  return {
    preset,
    setPreset,
    customRange,
    setCustomRange,
    chatFilterInfoOpen,
    setChatFilterInfoOpen,
    chatFilters,
    setChatFilters,
    invoices,
    loading,
    refreshing,
    error,
    fetchInvoices,
    afterIncomingInboxAction,
    handleDrawerNewChat,
    handleDrawerOpenConversation,
  };
}
