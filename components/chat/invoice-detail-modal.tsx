import { PrivacyCover } from "@/components/layout/privacy-cover";
import { prettyInvoiceStatus } from "@/lib/pretty-invoice-status";
import type { InvoiceDetail } from "@/types/chat-actions";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

interface InvoiceDetailModalProps {
  visible: boolean;
  invoice: InvoiceDetail | null;
  onClose: () => void;
  /** Yalnızca "outgoing" bilindiğinde "Yeniden fatura kes" gösterilir. */
  direction?: "outgoing" | "incoming";
  /** Taslak mesajla çağrılır; parent modalı kapatıp input'u doldurur. */
  onReissue?: (message: string) => void;
}

export function InvoiceDetailModal({
  visible,
  invoice,
  onClose,
  direction,
  onReissue,
}: InvoiceDetailModalProps) {
  const customerName = invoice?.customer_name?.trim();
  const canReissue = Boolean(
    direction === "outgoing" && onReissue && customerName,
  );

  const handleReissue = () => {
    if (!customerName || !onReissue) return;
    onReissue(`${customerName} için geçen seferkiyle aynı faturayı kes`);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Fatura Detayı</Text>
          <Text style={styles.modalLine}>
            Müşteri: {invoice?.customer_name || "—"}
          </Text>
          <Text style={styles.modalLine}>
            Tarih: {invoice?.issue_date || "—"}
          </Text>
          <Text style={styles.modalLine}>
            Durum: {prettyInvoiceStatus(invoice?.status)}
          </Text>
          <Text style={styles.modalLine}>
            VKN/TCKN: {invoice?.customer_tax_id || "—"}
          </Text>
          <Text style={styles.modalLine}>
            Brüt:{" "}
            {typeof invoice?.gross_total === "number"
              ? `${invoice.gross_total.toLocaleString("tr-TR")} ${invoice.currency}`
              : "—"}
          </Text>
          <Text style={styles.modalLine}>
            KDV:{" "}
            {typeof invoice?.vat_total === "number"
              ? `${invoice.vat_total.toLocaleString("tr-TR")} ${invoice.currency}`
              : "—"}
          </Text>
          <Text style={styles.modalLine}>
            ETTN: {invoice?.invoice_uuid || "—"}
          </Text>
          <View style={styles.modalFooter}>
            {canReissue ? (
              <Pressable style={styles.modalReissueBtn} onPress={handleReissue}>
                <Text style={styles.modalReissueBtnText}>
                  Yeniden fatura kes
                </Text>
              </Pressable>
            ) : (
              <View />
            )}
            <Pressable style={styles.modalCloseBtn} onPress={onClose}>
              <Text style={styles.modalCloseBtnText}>Kapat</Text>
            </Pressable>
          </View>
        </View>
      </View>
      {/* Native Modal ayrı pencerede çizilir; kök PrivacyCover'ı örtmez. */}
      <PrivacyCover />
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  modalCard: {
    width: "100%",
    borderRadius: 14,
    backgroundColor: "#fff",
    padding: 16,
    gap: 8,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#000",
    marginBottom: 4,
  },
  modalLine: {
    fontSize: 14,
    color: "#111",
    lineHeight: 20,
  },
  modalFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
    gap: 8,
  },
  modalReissueBtn: {
    borderWidth: 1,
    borderColor: "#D9D9D9",
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  modalReissueBtnText: {
    color: "#000",
    fontSize: 13,
    fontWeight: "600",
  },
  modalCloseBtn: {
    backgroundColor: "#000",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  modalCloseBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
});
