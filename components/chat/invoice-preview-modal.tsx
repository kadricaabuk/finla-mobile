import { PrivacyCover } from "@/components/layout/privacy-cover";
import { injectHtmlViewport } from "@/lib/inject-html-viewport";
import { callApi, userFacingApiError } from "@/lib/supabase";
import type { ChatMessageAction } from "@/types/chat-actions";
import { Ionicons } from "@expo/vector-icons";
import {
  cacheDirectory,
  EncodingType,
  writeAsStringAsync,
} from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import WebView from "react-native-webview";

export type InvoicePreviewRequest = {
  uuid: string;
  direction?: "outgoing" | "incoming";
  title?: string;
  issued?: boolean;
  draftDate?: string;
  html?: string;
  pdfBase64?: string;
};

interface InvoicePreviewModalProps {
  action?: ChatMessageAction | null;
  request?: InvoicePreviewRequest | null;
  conversationId?: string | null;
  onClose: () => void;
}

type InvoiceHtmlResponse = {
  html?: string;
  pdfBase64?: string;
};

async function writePdfToCache(
  uuid: string,
  pdfBase64: string,
): Promise<string> {
  const baseDir =
    typeof cacheDirectory === "string" && cacheDirectory.length > 0
      ? cacheDirectory
      : "";
  if (!baseDir) {
    throw new Error("Dosya önbelleği kullanılamıyor.");
  }
  const path = `${baseDir}invoice-preview-${uuid}.pdf`;
  await writeAsStringAsync(path, pdfBase64, {
    encoding: EncodingType.Base64,
  });
  return path;
}

function previewFromAction(
  action: ChatMessageAction | null | undefined,
): InvoicePreviewRequest | null {
  if (action?.type !== "open_invoice_preview" || !action.preview) return null;
  const preview = action.preview;
  if (!preview.uuid && !preview.html && !preview.pdfBase64) return null;
  return {
    uuid: preview.uuid ?? "",
    direction: preview.direction ?? action.filter?.direction,
    title: preview.title,
    issued: preview.issued,
    draftDate: preview.draftDate,
    html: preview.html,
    pdfBase64: preview.pdfBase64,
  };
}

export function InvoicePreviewModal({
  action = null,
  request = null,
  conversationId = null,
  onClose,
}: InvoicePreviewModalProps) {
  const [fetchedHtml, setFetchedHtml] = useState<string | null>(null);
  const [fetchedPdfUri, setFetchedPdfUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingHtml, setLoadingHtml] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const effective = useMemo(
    () => request ?? previewFromAction(action),
    [request, action],
  );

  const uuid = effective?.uuid?.trim() || undefined;
  const propHtml = effective?.html;
  const propPdfBase64 = effective?.pdfBase64;
  const draftDate = effective?.draftDate;
  const issued = effective?.issued ?? false;
  const direction = effective?.direction ?? "outgoing";
  const title = effective?.title ?? "Fatura Önizleme";

  const visible = !!(
    effective &&
    (effective.uuid || effective.html || effective.pdfBase64)
  );

  const html = propHtml ?? fetchedHtml;
  const pdfUri = fetchedPdfUri;

  useEffect(() => {
    if (!visible) {
      setFetchedHtml(null);
      setFetchedPdfUri(null);
      setError(null);
      setLoadingHtml(false);
      setRetryKey(0);
      return;
    }

    if (propHtml) {
      setFetchedHtml(null);
      setFetchedPdfUri(null);
      setError(null);
      setLoadingHtml(false);
      return;
    }

    if (propPdfBase64 && uuid) {
      let cancelled = false;
      setLoadingHtml(true);
      setError(null);
      setFetchedPdfUri(null);
      void writePdfToCache(uuid, propPdfBase64)
        .then((uri) => {
          if (!cancelled) setFetchedPdfUri(uri);
        })
        .catch((e) => {
          if (!cancelled) setError(userFacingApiError(e));
        })
        .finally(() => {
          if (!cancelled) setLoadingHtml(false);
        });
      return () => {
        cancelled = true;
      };
    }

    if (!uuid) {
      setFetchedHtml(null);
      setFetchedPdfUri(null);
      setError(null);
      setLoadingHtml(false);
      return;
    }

    let cancelled = false;
    setLoadingHtml(true);
    setError(null);
    setFetchedHtml(null);
    setFetchedPdfUri(null);

    const run = async () => {
      const fetchOnce = async (signed: boolean) =>
        callApi<InvoiceHtmlResponse>("invoice-html", {
          invoiceUuid: uuid,
          signed,
          direction,
          ...(draftDate ? { draftDate } : {}),
          ...(conversationId ? { conversationId } : {}),
        });

      const applyResponse = async (res: InvoiceHtmlResponse) => {
        if (res.html) {
          setFetchedHtml(res.html);
          return;
        }
        if (res.pdfBase64) {
          const uri = await writePdfToCache(uuid, res.pdfBase64);
          setFetchedPdfUri(uri);
        }
      };

      try {
        const res = await fetchOnce(issued);
        if (!cancelled) await applyResponse(res);
      } catch {
        try {
          const res = await fetchOnce(!issued);
          if (!cancelled) await applyResponse(res);
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
  }, [
    visible,
    uuid,
    propHtml,
    propPdfBase64,
    draftDate,
    issued,
    direction,
    retryKey,
    conversationId,
  ]);

  const hasContent = !!html || !!pdfUri;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.previewScreen} edges={["top", "bottom"]}>
          <View style={styles.previewHeader}>
            <Text style={styles.previewHeaderTitle} numberOfLines={1}>
              {title}
            </Text>
            <View style={styles.previewHeaderButtons}>
              {hasContent ? (
                <TouchableOpacity
                  style={styles.previewHeaderBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  onPress={async () => {
                    let shareUri = pdfUri;
                    if (!shareUri && html) {
                      const { uri } = await Print.printToFileAsync({
                        html,
                        base64: false,
                      });
                      shareUri = uri;
                    }
                    if (!shareUri) return;
                    const canShare = await Sharing.isAvailableAsync();
                    if (canShare) {
                      await Sharing.shareAsync(shareUri, {
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

          {loadingHtml && !hasContent ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color="#000" />
              <Text style={styles.hint}>Önizleme yükleniyor…</Text>
            </View>
          ) : error && !hasContent ? (
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
          ) : pdfUri ? (
            <WebView
              source={{ uri: pdfUri }}
              style={styles.previewWebView}
              originWhitelist={["*"]}
              javaScriptEnabled={false}
              scrollEnabled
              {...(Platform.OS === "android"
                ? { allowFileAccess: true, allowFileAccessFromFileURLs: true }
                : {})}
            />
          ) : null}
        </SafeAreaView>
      </SafeAreaProvider>
      {/* Native Modal ayrı pencerede çizilir; kök PrivacyCover'ı örtmez. */}
      <PrivacyCover />
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
