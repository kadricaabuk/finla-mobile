import { getCredentials } from "@/lib/session";
import { callEdgeFunction } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// GİB returns field names in Turkish — we accept whatever comes back
interface GIBInvoice {
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

type Preset = "bu_ay" | "gecen_ay" | "bu_yil";
type DateRange = { startDate: string; endDate: string };

const PRESETS: { key: Preset; label: string }[] = [
  { key: "bu_ay", label: "Bu Ay" },
  { key: "gecen_ay", label: "Geçen Ay" },
  { key: "bu_yil", label: "Bu Yıl" },
];

function fmt(d: Date) {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function getRange(preset: Preset): { startDate: string; endDate: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  if (preset === "bu_ay") {
    return { startDate: fmt(new Date(y, m, 1)), endDate: fmt(now) };
  }
  if (preset === "gecen_ay") {
    return {
      startDate: fmt(new Date(y, m - 1, 1)),
      endDate: fmt(new Date(y, m, 0)),
    };
  }
  // bu_yil
  return {
    startDate: fmt(new Date(y, 0, 1)),
    endDate: fmt(new Date(y, 11, 31)),
  };
}

function formatAmount(val?: string | number): string {
  const n = typeof val === "string" ? parseFloat(val) : (val ?? 0);
  if (isNaN(n)) return "—";
  return n.toLocaleString("tr-TR", { minimumFractionDigits: 2 }) + " ₺";
}

function statusColor(status?: string): string {
  if (!status) return "#ABABAB";
  const s = status.toLowerCase();
  if (s.includes("onay")) return "#22C55E";
  if (s.includes("iptal") || s.includes("red")) return "#EF4444";
  return "#ABABAB";
}

export default function InvoicesScreen() {
  const params = useLocalSearchParams<{
    startDate?: string;
    endDate?: string;
    customerName?: string;
    amountGte?: string;
    amountEq?: string;
    source?: string;
  }>();
  const [preset, setPreset] = useState<Preset>("bu_ay");
  const [customRange, setCustomRange] = useState<DateRange | null>(null);
  const [chatFilterInfoOpen, setChatFilterInfoOpen] = useState(false);
  const [chatFilters, setChatFilters] = useState<{
    customerName?: string;
    amountGte?: number;
    amountEq?: number;
  } | null>(null);
  const [invoices, setInvoices] = useState<GIBInvoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchInvoices = useCallback(
    async (p: Preset, rangeOverride?: DateRange) => {
      const creds = await getCredentials();
      if (!creds) return;

      setLoading(true);
      setError(null);

      try {
        const range = rangeOverride ?? getRange(p);
        const res = await callEdgeFunction<{
          invoices: GIBInvoice[];
          error?: string;
        }>("invoices", {
          username: creds.username,
          password: creds.password,
          ...range,
          customerName: chatFilters?.customerName,
          amountGte: chatFilters?.amountGte,
          amountEq: chatFilters?.amountEq,
        });
        if (res.error) throw new Error(res.error);
        setInvoices(res.invoices ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Faturalar yüklenemedi.");
        setInvoices([]);
      } finally {
        setLoading(false);
      }
    },
    [chatFilters],
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
          typeof params.customerName === "string" ? params.customerName : undefined,
        amountGte:
          typeof params.amountGte === "string" ? Number(params.amountGte) : undefined,
        amountEq:
          typeof params.amountEq === "string" ? Number(params.amountEq) : undefined,
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
    fetchInvoices(preset, customRange ?? undefined);
  }, [preset, customRange, fetchInvoices]);

  const renderItem = ({ item }: { item: GIBInvoice }) => {
    const total = item.vergilerDahilToplamTutar ?? item.malhizmetToplamTutari;
    const color = statusColor(item.onayDurumu);

    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <Text style={styles.buyerName} numberOfLines={1}>
            {item.aliciUnvanAdSoyad || "—"}
          </Text>
          <Text style={styles.amount}>{formatAmount(total)}</Text>
        </View>
        <View style={styles.cardBottom}>
          <Text style={styles.meta}>
            {item.belgeTarihi || "—"}
            {item.belgeNumarasi ? `  ·  ${item.belgeNumarasi}` : ""}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: color + "20" }]}>
            <Text style={[styles.statusText, { color }]}>
              {item.onayDurumu || "Bilinmiyor"}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.title}>Faturalarım</Text>
        {customRange ? (
          <TouchableOpacity
            style={styles.chatFilterBtn}
            onPress={() => setChatFilterInfoOpen((v) => !v)}
          >
            <Text style={styles.chatFilterBtnText}>Chat filtresi</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.backBtn} />
        )}
      </View>

      <View style={styles.filters}>
        {PRESETS.map((p) => (
          <TouchableOpacity
            key={p.key}
            style={[
              styles.chip,
              !customRange && preset === p.key && styles.chipActive,
              customRange && styles.chipDisabled,
            ]}
            onPress={() => {
              setCustomRange(null);
              setChatFilters(null);
              setChatFilterInfoOpen(false);
              setPreset(p.key);
            }}
            disabled={!!customRange}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.chipText,
                !customRange && preset === p.key && styles.chipTextActive,
                customRange && styles.chipTextDisabled,
              ]}
            >
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {customRange && (
        <View style={styles.customRangeBox}>
          <Text style={styles.customRangeText}>
            Chat filtresi: {customRange.startDate} - {customRange.endDate}
          </Text>
          {chatFilterInfoOpen && (
            <View style={styles.chatFilterDetails}>
              {chatFilters?.customerName ? (
                <Text style={styles.chatFilterDetailText}>
                  Müşteri: {chatFilters.customerName}
                </Text>
              ) : null}
              {typeof chatFilters?.amountGte === "number" ? (
                <Text style={styles.chatFilterDetailText}>
                  Tutar {'>='} {chatFilters.amountGte.toLocaleString("tr-TR")} TL
                </Text>
              ) : null}
              {typeof chatFilters?.amountEq === "number" ? (
                <Text style={styles.chatFilterDetailText}>
                  Tutar {'~='} {chatFilters.amountEq.toLocaleString("tr-TR")} TL
                </Text>
              ) : null}
              <TouchableOpacity
                style={styles.resetChatFilterBtn}
                onPress={() => {
                  setCustomRange(null);
                  setChatFilters(null);
                  setChatFilterInfoOpen(false);
                }}
              >
                <Text style={styles.resetChatFilterBtnText}>Preset filtrelere dön</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#000" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={40} color="#EF4444" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => fetchInvoices(preset, customRange ?? undefined)}
          >
            <Text style={styles.retryText}>Tekrar Dene</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={invoices}
          keyExtractor={(item, i) => item.ettn ?? String(i)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={() => fetchInvoices(preset, customRange ?? undefined)}
              tintColor="#000"
            />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="document-outline" size={48} color="#DDDDDD" />
              <Text style={styles.emptyText}>
                Bu dönemde fatura bulunamadı.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  chatFilterBtn: {
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: "#111",
    justifyContent: "center",
  },
  chatFilterBtnText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: "#000",
  },
  filters: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  customRangeBox: {
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#F5F5F5",
  },
  customRangeText: {
    fontSize: 12,
    color: "#666",
    fontWeight: "500",
  },
  chatFilterDetails: {
    marginTop: 8,
    gap: 4,
  },
  chatFilterDetailText: {
    fontSize: 12,
    color: "#555",
  },
  resetChatFilterBtn: {
    marginTop: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#E9E9E9",
  },
  resetChatFilterBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#333",
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#E0E0E0",
    backgroundColor: "#fff",
  },
  chipActive: {
    backgroundColor: "#000",
    borderColor: "#000",
  },
  chipText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#666",
  },
  chipTextActive: {
    color: "#fff",
  },
  chipDisabled: {
    opacity: 0.45,
  },
  chipTextDisabled: {
    color: "#AAA",
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 24,
    gap: 10,
    flexGrow: 1,
  },
  card: {
    backgroundColor: "#FAFAFA",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#F0F0F0",
    gap: 8,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  buyerName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#000",
    flex: 1,
    marginRight: 8,
  },
  amount: {
    fontSize: 15,
    fontWeight: "700",
    color: "#000",
  },
  cardBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  meta: {
    fontSize: 12,
    color: "#ABABAB",
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingBottom: 80,
  },
  errorText: {
    fontSize: 14,
    color: "#EF4444",
    textAlign: "center",
    paddingHorizontal: 32,
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: "#000",
    borderRadius: 10,
  },
  retryText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  emptyText: {
    fontSize: 14,
    color: "#ABABAB",
    textAlign: "center",
  },
});
