import { formatGibAmount, gibStatusColor } from "@/lib/format-gib-invoice";
import type { GIBInvoice } from "@/types/gib-invoice";
import { StyleSheet, Text, View } from "react-native";

interface InvoiceRowCardProps {
  item: GIBInvoice;
}

export function InvoiceRowCard({ item }: InvoiceRowCardProps) {
  const total =
    item.vergilerDahilToplamTutar ?? item.malhizmetToplamTutari;
  const color = gibStatusColor(item.onayDurumu);

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.buyerName} numberOfLines={1}>
          {item.aliciUnvanAdSoyad || "—"}
        </Text>
        <Text style={styles.amount}>{formatGibAmount(total)}</Text>
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
}

const styles = StyleSheet.create({
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
});
