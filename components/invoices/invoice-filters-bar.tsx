import {
    INVOICE_DATE_PRESETS,
    type InvoiceDatePreset,
    type InvoiceDateRange,
} from "@/lib/invoice-date-presets";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface ChatFiltersState {
  customerName?: string;
  amountGte?: number;
  amountEq?: number;
}

interface InvoiceFiltersBarProps {
  preset: InvoiceDatePreset;
  customRange: InvoiceDateRange | null;
  chatFilterInfoOpen: boolean;
  chatFilters: ChatFiltersState | null;
  onSelectPreset: (key: InvoiceDatePreset) => void;
  onResetChatFilters: () => void;
}

export function InvoiceFiltersBar({
  preset,
  customRange,
  chatFilterInfoOpen,
  chatFilters,
  onSelectPreset,
  onResetChatFilters,
}: InvoiceFiltersBarProps) {
  return (
    <>
      <View style={styles.filters}>
        {INVOICE_DATE_PRESETS.map((p) => (
          <TouchableOpacity
            key={p.key}
            style={[
              styles.chip,
              !customRange && preset === p.key && styles.chipActive,
              customRange && styles.chipDisabled,
            ]}
            onPress={() => onSelectPreset(p.key)}
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
                  Tutar {">="} {chatFilters.amountGte.toLocaleString("tr-TR")}{" "}
                  TL
                </Text>
              ) : null}
              {typeof chatFilters?.amountEq === "number" ? (
                <Text style={styles.chatFilterDetailText}>
                  Tutar {"~="} {chatFilters.amountEq.toLocaleString("tr-TR")} TL
                </Text>
              ) : null}
              <TouchableOpacity
                style={styles.resetChatFilterBtn}
                onPress={onResetChatFilters}
              >
                <Text style={styles.resetChatFilterBtnText}>
                  Preset filtrelere dön
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
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
});
