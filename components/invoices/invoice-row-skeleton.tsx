import { SkeletonBar } from "@/components/layout/skeleton";
import { colors, radius } from "@/constants/theme";
import { StyleSheet, View } from "react-native";

/** Pulsing skeleton shown in place of an invoice card while loading. */
export function InvoiceRowSkeleton() {
  return (
    <View style={styles.card}>
      <View style={styles.line}>
        <SkeletonBar style={styles.name} />
        <SkeletonBar style={styles.amount} />
      </View>
      <View style={styles.line}>
        <SkeletonBar style={styles.meta} />
        <SkeletonBar style={styles.badge} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.pressed,
    padding: 14,
    gap: 12,
  },
  line: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  name: {
    width: "48%",
    height: 15,
  },
  amount: {
    width: "24%",
    height: 15,
  },
  meta: {
    width: "36%",
    height: 12,
  },
  badge: {
    width: 64,
    height: 12,
  },
});
