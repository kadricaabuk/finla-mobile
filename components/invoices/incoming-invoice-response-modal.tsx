import { PrivacyCover } from "@/components/layout/privacy-cover";
import { injectHtmlViewport } from "@/lib/inject-html-viewport";
import { callApi, userFacingApiError } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import {
  cacheDirectory,
  EncodingType,
  writeAsStringAsync,
} from "expo-file-system/legacy";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import WebView from "react-native-webview";

export type IncomingInvoiceResponseRequest = {
  uuid: string;
  title?: string;
};

export type IncomingInboxActionSuccess = {
  invoiceUuid: string;
  status: "accepted" | "rejected";
  statusLabel?: string;
};

interface IncomingInvoiceResponseModalProps {
  request: IncomingInvoiceResponseRequest | null;
  onClose: () => void;
  onSuccess?: (result: IncomingInboxActionSuccess) => void;
}

type InvoiceHtmlResponse = {
  html?: string;
  pdfBase64?: string;
};

type InboxActionResponse = {
  ok: boolean;
  status: "accepted" | "rejected";
  status_label?: string;
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
  const path = `${baseDir}invoice-response-${uuid}.pdf`;
  await writeAsStringAsync(path, pdfBase64, {
    encoding: EncodingType.Base64,
  });
  return path;
}

export function IncomingInvoiceResponseModal({
  request,
  onClose,
  onSuccess,
}: IncomingInvoiceResponseModalProps) {
  const [fetchedHtml, setFetchedHtml] = useState<string | null>(null);
  const [fetchedPdfUri, setFetchedPdfUri] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const visible = !!request?.uuid?.trim();
  const uuid = request?.uuid?.trim();
  const title = request?.title ?? "Gelen Fatura Yanıtı";
  const hasPreview = !!fetchedHtml || !!fetchedPdfUri;

  useEffect(() => {
    if (!visible || !uuid) {
      setFetchedHtml(null);
      setFetchedPdfUri(null);
      setPreviewError(null);
      setPreviewLoading(false);
      setRetryKey(0);
      setRejectMode(false);
      setRejectReason("");
      setActionLoading(false);
      setActionError(null);
      return;
    }

    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(null);
    setFetchedHtml(null);
    setFetchedPdfUri(null);

    const run = async () => {
      try {
        const res = await callApi<InvoiceHtmlResponse>("invoice-html", {
          invoiceUuid: uuid,
          signed: true,
          direction: "incoming",
        });
        if (cancelled) return;
        if (res.html) {
          setFetchedHtml(res.html);
          return;
        }
        if (res.pdfBase64) {
          const uri = await writePdfToCache(uuid, res.pdfBase64);
          if (!cancelled) setFetchedPdfUri(uri);
        }
      } catch (err) {
        if (!cancelled) setPreviewError(userFacingApiError(err));
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [visible, uuid, retryKey]);

  const submitAccept = async () => {
    if (!uuid || actionLoading) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await callApi<InboxActionResponse>("invoice-inbox-action", {
        invoiceUuid: uuid,
        action: "accept",
      });
      onSuccess?.({
        invoiceUuid: uuid,
        status: res.status,
        statusLabel: res.status_label,
      });
      onClose();
    } catch (err) {
      setActionError(userFacingApiError(err));
    } finally {
      setActionLoading(false);
    }
  };

  const submitReject = async () => {
    if (!uuid || actionLoading) return;
    const reason = rejectReason.trim();
    if (reason.length < 3) {
      setActionError("Red sebebi en az 3 karakter olmalıdır.");
      return;
    }
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await callApi<InboxActionResponse>("invoice-inbox-action", {
        invoiceUuid: uuid,
        action: "reject",
        rejectReason: reason,
      });
      onSuccess?.({
        invoiceUuid: uuid,
        status: res.status,
        statusLabel: res.status_label,
      });
      onClose();
    } catch (err) {
      setActionError(userFacingApiError(err));
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
          <View style={styles.header}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {title}
            </Text>
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Kapat"
            >
              <Ionicons name="close" size={24} color="#000" />
            </TouchableOpacity>
          </View>

          <View style={styles.previewArea}>
            {previewLoading && !hasPreview ? (
              <View style={styles.centered}>
                <ActivityIndicator size="large" color="#000" />
                <Text style={styles.hint}>Fatura yükleniyor…</Text>
              </View>
            ) : previewError && !hasPreview ? (
              <View style={styles.centered}>
                <Text style={styles.errorText}>{previewError}</Text>
                <TouchableOpacity
                  style={styles.retryBtn}
                  onPress={() => setRetryKey((k) => k + 1)}
                >
                  <Text style={styles.retryBtnText}>Tekrar dene</Text>
                </TouchableOpacity>
              </View>
            ) : fetchedHtml ? (
              <WebView
                source={{ html: injectHtmlViewport(fetchedHtml) }}
                style={styles.webView}
                originWhitelist={["*"]}
                javaScriptEnabled={false}
                scrollEnabled
              />
            ) : fetchedPdfUri ? (
              <WebView
                source={{ uri: fetchedPdfUri }}
                style={styles.webView}
                originWhitelist={["*"]}
                javaScriptEnabled={false}
                scrollEnabled
                {...(Platform.OS === "android"
                  ? { allowFileAccess: true, allowFileAccessFromFileURLs: true }
                  : {})}
              />
            ) : null}
          </View>

          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
          >
            <View style={styles.footer}>
              {actionError ? (
                <Text style={styles.actionError}>{actionError}</Text>
              ) : null}

              {rejectMode ? (
                <>
                  <Text style={styles.rejectLabel}>Red sebebi</Text>
                  <TextInput
                    style={styles.rejectInput}
                    value={rejectReason}
                    onChangeText={setRejectReason}
                    placeholder="Red nedenini yazın…"
                    placeholderTextColor="#999"
                    multiline
                    maxLength={500}
                    editable={!actionLoading}
                    autoFocus
                  />
                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={styles.secondaryBtn}
                      onPress={() => {
                        setRejectMode(false);
                        setRejectReason("");
                        setActionError(null);
                      }}
                      disabled={actionLoading}
                    >
                      <Text style={styles.secondaryBtnText}>Vazgeç</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.rejectBtn, actionLoading && styles.btnDisabled]}
                      onPress={() => void submitReject()}
                      disabled={actionLoading}
                    >
                      {actionLoading ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.rejectBtnText}>Reddi Gönder</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={[styles.rejectBtn, actionLoading && styles.btnDisabled]}
                    onPress={() => {
                      setRejectMode(true);
                      setActionError(null);
                    }}
                    disabled={actionLoading}
                  >
                    <Text style={styles.rejectBtnText}>Reddet</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.acceptBtn, actionLoading && styles.btnDisabled]}
                    onPress={() => void submitAccept()}
                    disabled={actionLoading}
                  >
                    {actionLoading ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons
                          name="checkmark-circle-outline"
                          size={20}
                          color="#fff"
                        />
                        <Text style={styles.acceptBtnText}>Onayla</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </SafeAreaProvider>
      {/* Native Modal ayrı pencerede çizilir; kök PrivacyCover'ı örtmez. */}
      <PrivacyCover />
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#DCDCDC",
  },
  headerTitle: {
    flex: 1,
    marginRight: 12,
    fontSize: 17,
    fontWeight: "600",
    color: "#000",
  },
  headerBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  previewArea: {
    flex: 1,
    backgroundColor: "#fff",
  },
  webView: {
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
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E5E5",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 10,
    backgroundColor: "#fff",
  },
  actionError: {
    fontSize: 13,
    color: "#EF4444",
    textAlign: "center",
    lineHeight: 18,
  },
  rejectLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#333",
  },
  rejectInput: {
    minHeight: 72,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: "#111",
    textAlignVertical: "top",
    backgroundColor: "#FAFAFA",
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
  },
  acceptBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#16A34A",
    paddingVertical: 14,
    borderRadius: 10,
  },
  acceptBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  rejectBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EF4444",
    paddingVertical: 14,
    borderRadius: 10,
  },
  rejectBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  secondaryBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F3F3",
    paddingVertical: 14,
    borderRadius: 10,
  },
  secondaryBtnText: {
    color: "#111",
    fontSize: 15,
    fontWeight: "600",
  },
  btnDisabled: {
    opacity: 0.65,
  },
});
