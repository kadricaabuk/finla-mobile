import { formatGibAmount, gibStatusColor } from "@/lib/format-gib-invoice";
import { prettyInvoiceStatus } from "@/lib/pretty-invoice-status";
import { callApi, userFacingApiError } from "@/lib/supabase";
import type { InvoiceDetail } from "@/types/chat-actions";
import type { GIBInvoice, InvoiceListDirection } from "@/types/gib-invoice";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

interface InvoiceRowCardProps {
  item: GIBInvoice;
  listDirection?: InvoiceListDirection;
}

function counterpartyTitle(
  item: GIBInvoice,
  listDirection: InvoiceListDirection,
): string {
  if (listDirection === "incoming") {
    const raw =
      item.gondericiUnvanAdSoyad ??
      item.gondericiUnvan ??
      item.aliciUnvanAdSoyad;
    return typeof raw === "string" && raw.trim() ? raw.trim() : "—";
  }
  const raw = item.aliciUnvanAdSoyad ?? item.aliciUnvan;
  return typeof raw === "string" && raw.trim() ? raw.trim() : "—";
}

export function InvoiceRowCard({
  item,
  listDirection = "outgoing",
}: InvoiceRowCardProps) {
  const total =
    item.vergilerDahilToplamTutar ?? item.malhizmetToplamTutari;
  const color = gibStatusColor(item.onayDurumu);

  const [expanded, setExpanded] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    const uuid =
      typeof item.ettn === "string" && item.ettn.trim().length > 0
        ? item.ettn.trim()
        : null;
    if (!uuid) {
      setDetailError("Fatura kimliği (ETTN) bulunamadı.");
      return;
    }
    setDetailLoading(true);
    setDetailError(null);
    try {
      const res = await callApi<{ invoice: InvoiceDetail }>("invoice-detail", {
        invoiceUuid: uuid,
        direction: listDirection === "incoming" ? "incoming" : "outgoing",
      });
      setDetail(res.invoice ?? null);
    } catch (err) {
      setDetail(null);
      setDetailError(userFacingApiError(err));
    } finally {
      setDetailLoading(false);
    }
  }, [item.ettn, listDirection]);

  const toggle = useCallback(() => {
    setExpanded((was) => {
      const next = !was;
      if (next && !detail && !detailLoading) void loadDetail();
      return next;
    });
  }, [detail, detailLoading, loadDetail]);

  return (
    <View style={styles.card}>
      <Pressable
        onPress={toggle}
        style={({ pressed }) => [
          styles.cardHeader,
          pressed && styles.cardHeaderPressed,
        ]}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel="Fatura detayını aç veya kapat"
      >
        <View style={styles.cardTop}>
          <Text style={styles.buyerName} numberOfLines={1}>
            {counterpartyTitle(item, listDirection)}
          </Text>
          <Text style={styles.amount}>{formatGibAmount(total)}</Text>
        </View>
        <View style={styles.cardBottom}>
          <Text style={styles.meta}>
            {item.belgeTarihi || "—"}
            {item.belgeNumarasi ? `  ·  ${item.belgeNumarasi}` : ""}
          </Text>
          <View style={styles.cardBottomRight}>
            <View style={[styles.statusBadge, { backgroundColor: color + "20" }]}>
              <Text style={[styles.statusText, { color }]}>
                {item.onayDurumu || "Bilinmiyor"}
              </Text>
            </View>
            <Ionicons
              name={expanded ? "chevron-up" : "chevron-down"}
              size={20}
              color="#ABABAB"
            />
          </View>
        </View>
      </Pressable>

      {expanded ? (
        <View style={styles.detailSection}>
          {detailLoading ? (
            <View style={styles.detailLoading}>
              <ActivityIndicator size="small" color="#000" />
              <Text style={styles.detailMuted}>Detay yükleniyor…</Text>
            </View>
          ) : detailError ? (
            <Text style={styles.detailError}>{detailError}</Text>
          ) : detail ? (
            <View style={styles.detailBlock}>
              <Text style={styles.detailLine}>
                <Text style={styles.detailLabel}>
                  {listDirection === "incoming" ? "Gönderici: " : "Müşteri: "}
                </Text>
                {detail.customer_name || "—"}
              </Text>
              <Text style={styles.detailLine}>
                <Text style={styles.detailLabel}>Tarih: </Text>
                {detail.issue_date || "—"}
              </Text>
              <Text style={styles.detailLine}>
                <Text style={styles.detailLabel}>Durum: </Text>
                {prettyInvoiceStatus(detail.status)}
              </Text>
              <Text style={styles.detailLine}>
                <Text style={styles.detailLabel}>VKN/TCKN: </Text>
                {detail.customer_tax_id || "—"}
              </Text>
              <Text style={styles.detailLine}>
                <Text style={styles.detailLabel}>Matrah: </Text>
                {typeof detail.net_total === "number"
                  ? `${detail.net_total.toLocaleString("tr-TR")} ${detail.currency}`
                  : "—"}
              </Text>
              <Text style={styles.detailLine}>
                <Text style={styles.detailLabel}>KDV: </Text>
                {typeof detail.vat_total === "number"
                  ? `${detail.vat_total.toLocaleString("tr-TR")} ${detail.currency}`
                  : "—"}
              </Text>
              <Text style={styles.detailLine}>
                <Text style={styles.detailLabel}>Brüt: </Text>
                {typeof detail.gross_total === "number"
                  ? `${detail.gross_total.toLocaleString("tr-TR")} ${detail.currency}`
                  : "—"}
              </Text>
              <Text style={styles.detailLine}>
                <Text style={styles.detailLabel}>ETTN: </Text>
                {detail.invoice_uuid || "—"}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FAFAFA",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#F0F0F0",
    overflow: "hidden",
  },
  cardHeader: {
    padding: 14,
    gap: 8,
  },
  cardHeaderPressed: {
    backgroundColor: "#F3F3F3",
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
  cardBottomRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
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
  detailSection: {
    borderTopWidth: 1,
    borderTopColor: "#EAEAEA",
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 12,
  },
  detailLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  detailMuted: {
    fontSize: 13,
    color: "#888",
  },
  detailError: {
    fontSize: 13,
    color: "#EF4444",
    lineHeight: 18,
  },
  detailBlock: {
    gap: 6,
  },
  detailLine: {
    fontSize: 13,
    color: "#111",
    lineHeight: 19,
  },
  detailLabel: {
    fontWeight: "600",
    color: "#333",
  },
});
