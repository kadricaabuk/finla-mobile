import { useMainAppShell } from "@/contexts/main-app-shell-context";
import {
  getInvoiceCacheEntry,
  hydrateInvoiceCache,
  INVOICES_CACHE_TTL_MS,
  putInvoiceCacheEntry,
} from "@/lib/invoices-cache";
import {
  invoiceRangeForPreset,
  type InvoiceDatePreset,
  type InvoiceDateRange,
} from "@/lib/invoice-date-presets";
import { getTokens } from "@/lib/session";
import { callApi, userFacingApiError } from "@/lib/supabase";
import type { GIBInvoice, InvoiceListDirection } from "@/types/gib-invoice";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";

export function useInvoicesScreen(options?: {
  invoiceDirection?: InvoiceListDirection;
}) {
  const invoiceDirection = options?.invoiceDirection ?? "outgoing";
  const { closeMenu } = useMainAppShell();

  const params = useLocalSearchParams<{
    startDate?: string;
    endDate?: string;
    customerName?: string;
    amountGte?: string;
    amountEq?: string;
    source?: string;
  }>();

  const [preset, setPreset] = useState<InvoiceDatePreset>("bu_ay");
  const [customRange, setCustomRange] = useState<InvoiceDateRange | null>(
    null,
  );
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
      const cacheKey = `${invoiceDirection}|${range.startDate}|${range.endDate}`;

      await hydrateInvoiceCache(tokens.accessToken);

      if (!isRefresh && !chatFilters) {
        const cached = getInvoiceCacheEntry(cacheKey);
        if (cached && Date.now() - cached.fetchedAt < INVOICES_CACHE_TTL_MS) {
          setInvoices(cached.data as GIBInvoice[]);
          setError(null);
          return;
        }
      }

      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const res = await callApi<{
          invoices: GIBInvoice[];
          error?: string;
        }>("invoices", {
          ...range,
          direction: invoiceDirection,
          customerName: chatFilters?.customerName,
          amountGte: chatFilters?.amountGte,
          amountEq: chatFilters?.amountEq,
        });
        if (res.error) throw new Error(res.error);
        const data = res.invoices ?? [];
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
    [chatFilters, invoiceDirection],
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

  const handleDrawerNewChat = useCallback(() => {
    closeMenu();
    router.replace({
      pathname: "/",
      params: { resetKey: String(Date.now()) },
    });
  }, [closeMenu]);

  const handleDrawerOpenConversation = useCallback(
    (id: string) => {
      closeMenu();
      router.replace({
        pathname: "/",
        params: {
          loadConversationId: id,
          loadKey: String(Date.now()),
        },
      });
    },
    [closeMenu],
  );

  return {
    invoiceDirection,
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
    handleDrawerNewChat,
    handleDrawerOpenConversation,
  };
}

export type { InvoiceListDirection };
