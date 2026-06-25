import { InvoiceFiltersBar } from "@/components/invoices/invoice-filters-bar";
import { InvoiceRowCard } from "@/components/invoices/invoice-row-card";
import { useInvoicesScreen } from "@/components/invoices/use-invoices-screen";
import { IconHeaderButton } from "@/components/layout/icon-header-button";
import { useMainAppShell } from "@/contexts/main-app-shell-context";
import { useRegisterMainShellSideMenu } from "@/hooks/use-register-main-shell-side-menu";
import type { InvoiceDatePreset } from "@/lib/invoice-date-presets";
import type { InvoiceListDirection } from "@/types/gib-invoice";
import { Ionicons } from "@expo/vector-icons";
import { useMemo } from "react";
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

const INVOICES_SHELL_OWNER_ID = "screen-invoices";
const INCOMING_SHELL_OWNER_ID = "screen-incoming-invoices";

export interface InvoicesScreenProps {
  invoiceDirection?: InvoiceListDirection;
}

export default function InvoicesScreen({
  invoiceDirection = "outgoing",
}: InvoicesScreenProps) {
  const { openMenu } = useMainAppShell();
  const {
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
  } = useInvoicesScreen({ invoiceDirection });

  const shellOwnerId =
    invoiceDirection === "incoming"
      ? INCOMING_SHELL_OWNER_ID
      : INVOICES_SHELL_OWNER_ID;
  const headerTitle =
    invoiceDirection === "incoming" ? "Gelen faturalar" : "Faturalarım";
  const emptyHint =
    invoiceDirection === "incoming"
      ? "Bu dönemde gelen fatura bulunamadı."
      : "Bu dönemde fatura bulunamadı.";

  const sideMenuBindings = useMemo(
    () => ({
      activeScreen:
        invoiceDirection === "incoming"
          ? ("incoming_invoices" as const)
          : ("invoices" as const),
      openingConversationId: null,
      activeConversationId: null,
      onNewChat: handleDrawerNewChat,
      onOpenConversation: handleDrawerOpenConversation,
    }),
    [handleDrawerNewChat, handleDrawerOpenConversation, invoiceDirection],
  );

  useRegisterMainShellSideMenu(shellOwnerId, sideMenuBindings);

  const onSelectPreset = (key: InvoiceDatePreset) => {
    setCustomRange(null);
    setChatFilters(null);
    setChatFilterInfoOpen(false);
    setPreset(key);
  };

  const onResetChatFilters = () => {
    setCustomRange(null);
    setChatFilters(null);
    setChatFilterInfoOpen(false);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <IconHeaderButton
          testID="header-menu"
          name="menu"
          onPress={openMenu}
          accessibilityLabel="Menü"
        />
        <Text testID="invoices-title" style={styles.title} numberOfLines={1}>
          {headerTitle}
        </Text>
        <View style={styles.headerRight}>
          {customRange ? (
            <TouchableOpacity
              style={styles.chatFilterBtn}
              onPress={() => setChatFilterInfoOpen((v) => !v)}
            >
              <Text style={styles.chatFilterBtnText}>Chat filtresi</Text>
            </TouchableOpacity>
          ) : null}
          <IconHeaderButton
            name="create-outline"
            size={22}
            onPress={handleDrawerNewChat}
            accessibilityLabel="Yeni sohbet"
          />
        </View>
      </View>

      <InvoiceFiltersBar
        preset={preset}
        customRange={customRange}
        chatFilterInfoOpen={chatFilterInfoOpen}
        chatFilters={chatFilters}
        onSelectPreset={onSelectPreset}
        onResetChatFilters={onResetChatFilters}
      />

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
          renderItem={({ item }) => (
            <InvoiceRowCard item={item} listDirection={invoiceDirection} />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() =>
                fetchInvoices(preset, customRange ?? undefined, true)
              }
              tintColor="#000"
            />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="document-outline" size={48} color="#DDDDDD" />
              <Text style={styles.emptyText}>{emptyHint}</Text>
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
    gap: 8,
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: "600",
    color: "#000",
    textAlign: "center",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
    flexShrink: 0,
    maxWidth: "48%",
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
  list: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 24,
    gap: 10,
    flexGrow: 1,
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
