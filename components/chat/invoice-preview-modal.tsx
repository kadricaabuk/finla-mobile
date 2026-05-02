import { injectHtmlViewport } from "@/lib/inject-html-viewport";
import { callApi, userFacingApiError } from "@/lib/supabase";
import type { ChatMessageAction } from "@/types/chat-actions";
import { Ionicons } from "@expo/vector-icons";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import WebView from "react-native-webview";

interface InvoicePreviewModalProps {
  action: ChatMessageAction | null;
  onClose: () => void;
}

export function InvoicePreviewModal({
  action,
  onClose,
}: InvoicePreviewModalProps) {
  const [fetchedHtml, setFetchedHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingHtml, setLoadingHtml] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const uuid = action?.preview?.uuid;
  const propHtml = action?.preview?.html;
  const issued = action?.preview?.issued ?? false;

  const visible =
    action?.type === "open_invoice_preview" &&
    !!(action.preview?.uuid || action.preview?.html);

  const html = propHtml ?? fetchedHtml;

  useEffect(() => {
    if (!visible) {
      setFetchedHtml(null);
      setError(null);
      setLoadingHtml(false);
      setRetryKey(0);
      return;
    }

    if (propHtml || !uuid) {
      setFetchedHtml(null);
      setError(null);
      setLoadingHtml(false);
      return;
    }

    let cancelled = false;
    setLoadingHtml(true);
    setError(null);
    setFetchedHtml(null);

    const run = async () => {
      const fetchOnce = async (signed: boolean) =>
        callApi<{ html: string }>("invoice-html", {
          invoiceUuid: uuid,
          signed,
        });
      try {
        const res = await fetchOnce(issued);
        if (!cancelled) setFetchedHtml(res.html);
      } catch {
        try {
          const res = await fetchOnce(!issued);
          if (!cancelled) setFetchedHtml(res.html);
        } catch (e2) {
          if (!cancelled) setError(userFacingApiError(e2));
        }
      } finally {
        if (!cancelled) setLoadingHtml(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [visible, uuid, propHtml, issued, retryKey]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.previewScreen} edges={["top", "bottom"]}>
          <View style={styles.previewHeader}>
            <Text style={styles.previewHeaderTitle} numberOfLines={1}>
              {action?.preview?.title || "Fatura Önizleme"}
            </Text>
            <View style={styles.previewHeaderButtons}>
              {html ? (
                <TouchableOpacity
                  style={styles.previewHeaderBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  onPress={async () => {
                    const { uri } = await Print.printToFileAsync({
                      html,
                      base64: false,
                    });
                    const canShare = await Sharing.isAvailableAsync();
                    if (canShare) {
                      await Sharing.shareAsync(uri, {
                        mimeType: "application/pdf",
                        dialogTitle: "Fatura PDF",
                        UTI: "com.adobe.pdf",
                      });
                    }
                  }}
                >
                  <Ionicons name="share-outline" size={22} color="#000" />
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={styles.previewHeaderBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                onPress={onClose}
              >
                <Ionicons name="close" size={24} color="#000" />
              </TouchableOpacity>
            </View>
          </View>

          {loadingHtml && !html ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color="#000" />
              <Text style={styles.hint}>Önizleme yükleniyor…</Text>
            </View>
          ) : error && !html ? (
            <View style={styles.centered}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={() => setRetryKey((k) => k + 1)}
                activeOpacity={0.85}
              >
                <Text style={styles.retryBtnText}>Tekrar dene</Text>
              </TouchableOpacity>
            </View>
          ) : html ? (
            <WebView
              source={{ html: injectHtmlViewport(html) }}
              style={styles.previewWebView}
              originWhitelist={["*"]}
              javaScriptEnabled={false}
              scrollEnabled
            />
          ) : null}
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  previewScreen: {
    flex: 1,
    backgroundColor: "#fff",
  },
  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#DCDCDC",
    backgroundColor: "#fff",
  },
  previewHeaderTitle: {
    flex: 1,
    marginRight: 12,
    fontSize: 17,
    fontWeight: "600",
    color: "#000",
  },
  previewHeaderButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  previewHeaderBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  previewWebView: {
    flex: 1,
    backgroundColor: "#fff",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
    gap: 16,
  },
  hint: {
    marginTop: 8,
    fontSize: 15,
    color: "#666",
  },
  errorText: {
    fontSize: 15,
    color: "#333",
    textAlign: "center",
    lineHeight: 22,
  },
  retryBtn: {
    backgroundColor: "#000",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 999,
  },
  retryBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
});
