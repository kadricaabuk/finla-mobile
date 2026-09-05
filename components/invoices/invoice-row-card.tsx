import type { InvoicePreviewRequest } from "@/components/chat/invoice-preview-modal";
import type { IncomingInvoiceResponseRequest } from "@/components/invoices/incoming-invoice-response-modal";
import { formatGibAmount, gibStatusColor } from "@/lib/format-gib-invoice";
import {
  canRespondToIncomingInvoice,
  normalizeIncomingDisplayStatus,
} from "@/lib/incoming-invoice-status";
import { prettyInvoiceStatus } from "@/lib/pretty-invoice-status";
import { callApi, userFacingApiError } from "@/lib/supabase";
import type { InvoiceDetail } from "@/types/chat-actions";
import type { GIBInvoice, InvoiceListDirection } from "@/types/gib-invoice";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface InvoiceRowCardProps {
  item: GIBInvoice;
  listDirection?: InvoiceListDirection;
  onOpenPreview?: (request: InvoicePreviewRequest) => void;
  onOpenIncomingResponse?: (request: IncomingInvoiceResponseRequest) => void;
}

function counterpartyTitle(
  item: GIBInvoice,
  listDirection: InvoiceListDirection,
): string {
  if (listDirection === "incoming") {
    const raw = item.gondericiUnvanAdSoyad ?? item.gondericiUnvan;
    return typeof raw === "string" && raw.trim() ? raw.trim() : "—";
  }
  const raw = item.aliciUnvanAdSoyad ?? item.aliciUnvan;
  return typeof raw === "string" && raw.trim() ? raw.trim() : "—";
}

export function InvoiceRowCard({
  item,
  listDirection = "outgoing",
  onOpenPreview,
  onOpenIncomingResponse,
}: InvoiceRowCardProps) {
  const total = item.vergilerDahilToplamTutar ?? item.malhizmetToplamTutari;
  const statusLabel =
    listDirection === "incoming"
      ? normalizeIncomingDisplayStatus(item.onayDurumu ?? "")
      : item.onayDurumu || "Bilinmiyor";
  const color = gibStatusColor(String(statusLabel));
  const incomingRespondable =
    listDirection === "incoming" &&
    canRespondToIncomingInvoice(item.onayDurumu);

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
    setExpanded((was) => !was);
  }, []);

  useEffect(() => {
    if (!expanded) return;
    setDetail(null);
    setDetailError(null);
    void loadDetail();
  }, [expanded, item.ettn, item.onayDurumu, loadDetail]);

  const openPreview = useCallback(() => {
    const uuid =
      typeof item.ettn === "string" && item.ettn.trim().length > 0
        ? item.ettn.trim()
        : null;
    if (!uuid || !onOpenPreview) return;
    const counterparty = counterpartyTitle(item, listDirection);
    const docNo = item.belgeNumarasi?.trim();
    onOpenPreview({
      uuid,
      direction: listDirection === "incoming" ? "incoming" : "outgoing",
      title: docNo ? `Fatura ${docNo}` : counterparty,
      issued: true,
    });
  }, [item, listDirection, onOpenPreview]);

  const openIncomingResponse = useCallback(() => {
    const uuid =
      typeof item.ettn === "string" && item.ettn.trim().length > 0
        ? item.ettn.trim()
        : null;
    if (!uuid || !onOpenIncomingResponse) return;
    const counterparty = counterpartyTitle(item, listDirection);
    const docNo = item.belgeNumarasi?.trim();
    onOpenIncomingResponse({
      uuid,
      title: docNo ? `Fatura ${docNo}` : counterparty,
    });
  }, [item, listDirection, onOpenIncomingResponse]);

  // Giden faturayı sohbette taslak mesajla yeniden kestir: "/" ekranına
  // draftMessage ile gider; chat input doldurulur, gönderim kullanıcıya kalır.
  const reissueCustomer =
    listDirection === "outgoing" ? counterpartyTitle(item, listDirection) : "—";
  const canReissue = reissueCustomer !== "—";

  const handleReissue = useCallback(() => {
    if (!canReissue) return;
    const docNo = item.belgeNumarasi?.trim();
    const message = docNo
      ? `${reissueCustomer} için ${docNo} numaralı faturanın aynısını kes`
      : `${reissueCustomer} için geçen seferkiyle aynı faturayı kes`;
    router.replace({
      pathname: "/",
      params: { draftMessage: message, draftKey: String(Date.now()) },
    });
  }, [canReissue, item.belgeNumarasi, reissueCustomer]);

  const showPreviewOnly =
    typeof item.ettn === "string" &&
    item.ettn.trim().length > 0 &&
    onOpenPreview &&
    !incomingRespondable;

  return (
    <View style={styles.card}>
      <Pressable
        testID="invoice-row-toggle"
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
          <Text testID="invoice-row-amount" style={styles.amount}>{formatGibAmount(total)}</Text>
        </View>
        <View style={styles.cardBottom}>
          <Text style={styles.meta}>
            {item.belgeTarihi || "—"}
            {item.belgeNumarasi ? `  ·  ${item.belgeNumarasi}` : ""}
          </Text>
          <View style={styles.cardBottomRight}>
            <View
              style={[styles.statusBadge, { backgroundColor: color + "20" }]}
            >
              <Text style={[styles.statusText, { color }]}>{statusLabel}</Text>
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
                {prettyInvoiceStatus(detail.status, {
                  direction: listDirection,
                })}
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
                <Text testID="invoice-detail-gross">
                  {typeof detail.gross_total === "number"
                    ? formatGibAmount(detail.gross_total)
                    : "—"}
                </Text>
              </Text>
              <Text style={styles.detailLine}>
                <Text style={styles.detailLabel}>ETTN: </Text>
                {detail.invoice_uuid || "—"}
              </Text>
            </View>
          ) : null}

          {incomingRespondable && onOpenIncomingResponse ? (
            <TouchableOpacity
              style={styles.respondBtn}
              onPress={openIncomingResponse}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Faturayı onayla veya reddet"
            >
              <Ionicons
                name="checkmark-circle-outline"
                size={20}
                color="#fff"
              />
              <Text style={styles.respondBtnText}>Yanıt Ver</Text>
            </TouchableOpacity>
          ) : null}

          {showPreviewOnly && !detailLoading ? (
            <TouchableOpacity
              style={styles.previewBtn}
              onPress={openPreview}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Faturayı görüntüle"
            >
              <Ionicons name="document-text-outline" size={18} color="#fff" />
              <Text style={styles.previewBtnText}>Faturayı Gör</Text>
            </TouchableOpacity>
          ) : null}

          {canReissue ? (
            <TouchableOpacity
              style={styles.reissueBtn}
              onPress={handleReissue}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Aynı müşteriye yeniden fatura kes"
            >
              <Ionicons name="repeat-outline" size={18} color="#000" />
              <Text style={styles.reissueBtnText}>Yeniden fatura kes</Text>
            </TouchableOpacity>
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
    flex: 1,
    padding: 16,
    justifyContent: "center",
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
  respondBtn: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#000",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  respondBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  previewBtn: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#000",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  previewBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  reissueBtn: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#D9D9D9",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  reissueBtnText: {
    color: "#000",
    fontSize: 14,
    fontWeight: "600",
  },
});
