import ChatInput from "@/components/chat-input";
import SideMenu from "@/components/side-menu";
import {
  clearLegacyCredentials,
  clearTokens,
  decodeJwtSub,
  getTokens,
} from "@/lib/session";
import { callEdgeFunction, logoutRequest } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import * as Print from "expo-print";
import { router } from "expo-router";
import * as Sharing from "expo-sharing";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Markdown from "react-native-markdown-display";
import { SafeAreaView } from "react-native-safe-area-context";

interface Message {
  id: string;
  text: string;
  role: "user" | "assistant";
  action?: {
    type: "open_invoices" | "open_invoice_detail" | "open_invoice_preview" | "open_sign_otp";
    label: string;
    filter?: {
      startDate: string;
      endDate: string;
      customerName?: string;
      amountGte?: number;
      amountEq?: number;
    };
    invoice?: {
      invoice_uuid: string;
      issue_date: string | null;
      status: string;
      currency: string;
      gross_total: number | null;
      vat_total: number | null;
      net_total: number | null;
      customer_tax_id: string | null;
      customer_name: string | null;
    };
    preview?: {
      title: string;
      html: string;
      uuid?: string;
    };
    sign_otp?: {
      draftUuid: string;
      phoneMasked: string;
    };
  };
}

type InvoiceDetail = NonNullable<NonNullable<Message["action"]>["invoice"]>;

function hasMarkdownTable(text: string): boolean {
  return /^\|.*\|$/m.test(text);
}

function prettyStatus(status?: string): string {
  const s = (status || "").toLowerCase();
  if (s.includes("approved") || s.includes("onay")) return "Onaylandı";
  if (s.includes("draft") || s.includes("taslak") || s.includes("onaylanmad"))
    return "Taslak";
  if (s.includes("cancel") || s.includes("sil") || s.includes("iptal"))
    return "İptal/Silinmiş";
  return status || "—";
}

const markdownStyles = {
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: "#000",
    marginTop: 0,
    marginBottom: 0,
  },
  strong: {
    fontWeight: "700" as const,
  },
  bullet_list: {
    marginTop: 0,
    marginBottom: 0,
  },
  list_item: {
    marginTop: 0,
    marginBottom: 2,
  },
  paragraph: {
    marginTop: 0,
    marginBottom: 8,
  },
  table: {
    borderWidth: 1,
    borderColor: "#D7D7D7",
    borderRadius: 8,
    marginTop: 4,
    marginBottom: 8,
  },
  thead: {
    backgroundColor: "#ECECEC",
  },
  th: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontSize: 13,
    fontWeight: "700" as const,
    color: "#111",
  },
  td: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontSize: 13,
    color: "#111",
  },
  tr: {
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5E5",
  },
};

export default function ChatScreen() {
  const [sessionLabel, setSessionLabel] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [detailAction, setDetailAction] = useState<Message["action"] | null>(null);
  const [detailInvoice, setDetailInvoice] = useState<InvoiceDetail | null>(null);
  const [previewAction, setPreviewAction] = useState<Message["action"] | null>(null);
  const [confirmingDraftUuid, setConfirmingDraftUuid] = useState<string | null>(null);
  const [signOtpAction, setSignOtpAction] = useState<Message["action"] | null>(null);
  const [signOtpCode, setSignOtpCode] = useState("");
  const [signOtpPhone, setSignOtpPhone] = useState("");
  const [verifyingSignOtp, setVerifyingSignOtp] = useState(false);
  const [requestingSignOtp, setRequestingSignOtp] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    getTokens().then((tokens) => {
      if (!tokens) {
        router.replace("/login");
        return;
      }
      setSessionLabel(decodeJwtSub(tokens.accessToken) ?? "Hesap");
    });
  }, []);

  useEffect(() => {
    const loadDetail = async () => {
      if (!sessionLabel || detailAction?.type !== "open_invoice_detail" || !detailAction.invoice?.invoice_uuid) {
        setDetailInvoice(detailAction?.invoice ?? null);
        return;
      }
      try {
        const res = await callEdgeFunction<{
          invoice: InvoiceDetail;
        }>("invoice-detail", {
          invoiceUuid: detailAction.invoice.invoice_uuid,
        });
        setDetailInvoice(res.invoice ?? detailAction.invoice);
      } catch {
        setDetailInvoice(detailAction.invoice);
      }
    };
    loadDetail();
  }, [sessionLabel, detailAction]);

  const scrollToBottom = () =>
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);

  const handleSend = useCallback(
    async (text: string) => {
      const tokens = await getTokens();
      if (!tokens) return;

      const userMsg: Message = {
        id: Date.now().toString(),
        text,
        role: "user",
      };
      setMessages((prev) => [...prev, userMsg]);
      setLoading(true);
      scrollToBottom();

      try {
        const res = await callEdgeFunction<{
          message: string;
          conversationId: string;
          action?: Message["action"];
        }>("chat", {
          message: text,
          conversationId,
        });

        if (!conversationId) setConversationId(res.conversationId);

        const aiMsg: Message = {
          id: (Date.now() + 1).toString(),
          text: res.message,
          role: "assistant",
          action: res.action,
        };
        setMessages((prev) => [...prev, aiMsg]);
        if (res.action?.type === "open_sign_otp" && res.action.sign_otp?.draftUuid) {
          setSignOtpAction(res.action);
        }
      } catch (err) {
        const errMsg: Message = {
          id: (Date.now() + 1).toString(),
          text: `Hata: ${err instanceof Error ? err.message : "Beklenmeyen bir sorun oluştu."}`,
          role: "assistant",
        };
        setMessages((prev) => [...prev, errMsg]);
      } finally {
        setLoading(false);
        scrollToBottom();
      }
    },
    [conversationId],
  );

  const handleConfirmFromPreview = useCallback(async (draftUuid?: string) => {
    if (!(await getTokens()) || !conversationId || !draftUuid) return;
    if (confirmingDraftUuid === draftUuid) return;
    setConfirmingDraftUuid(draftUuid);
    setLoading(true);
    try {
      const res = await callEdgeFunction<{
        message: string;
        conversationId: string;
        action?: Message["action"];
      }>("chat", {
        message: "confirm_pending_invoice",
        conversationId,
        action: { type: "confirm_pending_invoice", draftUuid: draftUuid },
      });
      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        text: res.message,
        role: "assistant",
        action: res.action,
      };
      setMessages((prev) => [...prev, aiMsg]);
      if (res.action?.type === "open_sign_otp" && res.action.sign_otp?.draftUuid) {
        setSignOtpAction(res.action);
      }
    } catch (err) {
      const errMsg: Message = {
        id: (Date.now() + 1).toString(),
        text: `Hata: ${err instanceof Error ? err.message : "Onay sırasında beklenmeyen bir sorun oluştu."}`,
        role: "assistant",
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setLoading(false);
      setConfirmingDraftUuid(null);
      scrollToBottom();
    }
  }, [conversationId, confirmingDraftUuid]);

  const handleVerifySignOtp = useCallback(async () => {
    if (!(await getTokens()) || !conversationId || !signOtpAction?.sign_otp?.draftUuid) return;
    const code = signOtpCode.trim();
    if (!code || verifyingSignOtp) return;
    setVerifyingSignOtp(true);
    setLoading(true);
    try {
      const res = await callEdgeFunction<{
        message: string;
        conversationId: string;
        action?: Message["action"];
      }>("chat", {
        message: "verify_sign_otp",
        conversationId,
        action: {
          type: "verify_sign_otp",
          draftUuid: signOtpAction.sign_otp.draftUuid,
          smsCode: code,
        },
      });
      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        text: res.message,
        role: "assistant",
        action: res.action,
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      const errMsg: Message = {
        id: (Date.now() + 1).toString(),
        text: `Hata: ${err instanceof Error ? err.message : "SMS doğrulama sırasında beklenmeyen bir sorun oluştu."}`,
        role: "assistant",
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setVerifyingSignOtp(false);
      setLoading(false);
      setSignOtpAction(null);
      setSignOtpCode("");
      setSignOtpPhone("");
      scrollToBottom();
    }
  }, [conversationId, signOtpAction, signOtpCode, verifyingSignOtp]);

  const handleRequestSignOtp = useCallback(async (withPhoneUpdate: boolean) => {
    if (!(await getTokens()) || !conversationId || !signOtpAction?.sign_otp?.draftUuid) return;
    if (requestingSignOtp) return;
    const phone = signOtpPhone.trim();
    if (withPhoneUpdate && !phone) return;
    setRequestingSignOtp(true);
    setLoading(true);
    try {
      const res = await callEdgeFunction<{
        message: string;
        conversationId: string;
        action?: Message["action"];
      }>("chat", {
        message: "request_sign_otp",
        conversationId,
        action: {
          type: "request_sign_otp",
          draftUuid: signOtpAction.sign_otp.draftUuid,
          phone: withPhoneUpdate ? phone : undefined,
        },
      });
      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        text: res.message,
        role: "assistant",
        action: res.action,
      };
      setMessages((prev) => [...prev, aiMsg]);
      if (res.action?.type === "open_sign_otp" && res.action.sign_otp?.draftUuid) {
        setSignOtpAction(res.action);
      }
      if (withPhoneUpdate) setSignOtpPhone("");
    } catch (err) {
      const errMsg: Message = {
        id: (Date.now() + 1).toString(),
        text: `Hata: ${err instanceof Error ? err.message : "SMS doğrulama yeniden başlatılamadı."}`,
        role: "assistant",
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setRequestingSignOtp(false);
      setLoading(false);
      scrollToBottom();
    }
  }, [conversationId, requestingSignOtp, signOtpAction, signOtpPhone]);

  const handleNewChat = () => {
    setMessages([]);
    setConversationId(null);
    setIsMenuOpen(false);
  };

  const handleLogout = async () => {
    try {
      const tokens = await getTokens();
      if (tokens) await logoutRequest(tokens.accessToken);
    } catch {
      // Non-critical — proceed with local logout regardless
    }
    await clearTokens();
    await clearLegacyCredentials();
    router.replace("/login");
  };

  if (!sessionLabel) return null;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => setIsMenuOpen(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="menu" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.title}>finla</Text>
        <View style={styles.headerBtn} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.messagesContent}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
        >
          {messages.map((msg) => (
            <View
              key={msg.id}
              style={[
                styles.bubble,
                msg.role === "user" ? styles.userBubble : styles.aiBubble,
              ]}
            >
              {msg.role === "user" ? (
                <Text style={[styles.bubbleText, styles.userText]}>
                  {msg.text}
                </Text>
              ) : hasMarkdownTable(msg.text) ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <Markdown style={markdownStyles}>{msg.text}</Markdown>
                </ScrollView>
              ) : (
                <Markdown style={markdownStyles}>{msg.text}</Markdown>
              )}
              {msg.role === "assistant" &&
                msg.action?.type === "open_invoices" && (
                  <TouchableOpacity
                    style={styles.actionButton}
                    activeOpacity={0.8}
                    onPress={() =>
                      router.push({
                        pathname: "/invoices",
                        params: {
                          startDate: msg.action?.filter?.startDate,
                          endDate: msg.action?.filter?.endDate,
                          customerName: msg.action?.filter?.customerName,
                          amountGte:
                            typeof msg.action?.filter?.amountGte === "number"
                              ? String(msg.action.filter?.amountGte)
                              : undefined,
                          amountEq:
                            typeof msg.action?.filter?.amountEq === "number"
                              ? String(msg.action.filter?.amountEq)
                              : undefined,
                          source: "chat",
                        },
                      })
                    }
                  >
                    <Text style={styles.actionButtonText}>
                      {msg.action.label || "Faturaları Gör"}
                    </Text>
                  </TouchableOpacity>
                )}
              {msg.role === "assistant" &&
                msg.action?.type === "open_invoice_detail" &&
                msg.action?.invoice && (
                  <TouchableOpacity
                    style={styles.actionButton}
                    activeOpacity={0.8}
                    onPress={() => setDetailAction(msg.action)}
                  >
                    <Text style={styles.actionButtonText}>
                      {msg.action.label || "Detayı Gör"}
                    </Text>
                  </TouchableOpacity>
                )}
              {msg.role === "assistant" &&
                msg.action?.type === "open_invoice_preview" &&
                msg.action?.preview?.html && (
                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={styles.actionButton}
                      activeOpacity={0.8}
                      onPress={() => setPreviewAction(msg.action)}
                    >
                      <Text style={styles.actionButtonText}>
                        {msg.action.label || "Faturayı Gör"}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.actionConfirmButton,
                        confirmingDraftUuid === msg.action?.preview?.uuid &&
                          styles.actionConfirmButtonDisabled,
                      ]}
                      activeOpacity={0.8}
                      disabled={confirmingDraftUuid === msg.action?.preview?.uuid}
                      onPress={() => handleConfirmFromPreview(msg.action?.preview?.uuid)}
                    >
                      <Text style={styles.actionConfirmButtonText}>
                        {confirmingDraftUuid === msg.action?.preview?.uuid
                          ? "Onaylanıyor..."
                          : "Onayla ve Kes"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
            </View>
          ))}

          {loading && (
            <View
              style={[styles.bubble, styles.aiBubble, styles.loadingBubble]}
            >
              <ActivityIndicator size="small" color="#888" />
            </View>
          )}
        </ScrollView>

        <ChatInput onSend={handleSend} />
      </KeyboardAvoidingView>

      <SideMenu
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        onNewChat={handleNewChat}
        onLogout={handleLogout}
        username={sessionLabel}
      />
      <Modal
        visible={!!detailAction?.invoice}
        transparent
        animationType="fade"
        onRequestClose={() => setDetailAction(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Fatura Detayı</Text>
            <Text style={styles.modalLine}>Müşteri: {detailInvoice?.customer_name || "—"}</Text>
            <Text style={styles.modalLine}>
              Tarih: {detailInvoice?.issue_date || "—"}
            </Text>
            <Text style={styles.modalLine}>
              Durum: {prettyStatus(detailInvoice?.status)}
            </Text>
            <Text style={styles.modalLine}>
              VKN/TCKN: {detailInvoice?.customer_tax_id || "—"}
            </Text>
            <Text style={styles.modalLine}>
              Brüt:{" "}
              {typeof detailInvoice?.gross_total === "number"
                ? `${detailInvoice.gross_total.toLocaleString("tr-TR")} ${detailInvoice.currency}`
                : "—"}
            </Text>
            <Text style={styles.modalLine}>
              KDV:{" "}
              {typeof detailInvoice?.vat_total === "number"
                ? `${detailInvoice.vat_total.toLocaleString("tr-TR")} ${detailInvoice.currency}`
                : "—"}
            </Text>
            <Text style={styles.modalLine}>
              ETTN: {detailInvoice?.invoice_uuid || "—"}
            </Text>
            <Pressable style={styles.modalCloseBtn} onPress={() => setDetailAction(null)}>
              <Text style={styles.modalCloseBtnText}>Kapat</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <Modal
        visible={!!previewAction?.preview?.html}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewAction(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {previewAction?.preview?.title || "Fatura Önizleme"}
            </Text>
            <Text style={styles.modalLine}>
              UUID: {previewAction?.preview?.uuid || "—"}
            </Text>
            <Pressable
              style={styles.modalCloseBtn}
              onPress={async () => {
                if (!previewAction?.preview?.html) return;
                const { uri } = await Print.printToFileAsync({
                  html: previewAction.preview.html,
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
              <Text style={styles.modalCloseBtnText}>PDF Aç / Paylaş</Text>
            </Pressable>
            <Pressable
              style={styles.modalSecondaryBtn}
              onPress={() => setPreviewAction(null)}
            >
              <Text style={styles.modalSecondaryBtnText}>Kapat</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <Modal
        visible={!!signOtpAction?.sign_otp?.draftUuid}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (verifyingSignOtp || requestingSignOtp) return;
          setSignOtpAction(null);
          setSignOtpCode("");
          setSignOtpPhone("");
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>SMS Doğrulama</Text>
            <Text style={styles.modalLine}>İmzalama için SMS doğrulama bekleniyor.</Text>
            <Text style={styles.modalLine}>
              Kod gönderilen numara: {signOtpAction?.sign_otp?.phoneMasked || "Kayıtlı numara"}
            </Text>
            <TextInput
              style={styles.otpInput}
              value={signOtpPhone}
              onChangeText={setSignOtpPhone}
              keyboardType="phone-pad"
              placeholder="Numara değiştir (opsiyonel)"
              placeholderTextColor="#ABABAB"
              editable={!verifyingSignOtp && !requestingSignOtp}
            />
            <TextInput
              style={styles.otpInput}
              value={signOtpCode}
              onChangeText={setSignOtpCode}
              keyboardType="number-pad"
              placeholder="SMS kodu"
              placeholderTextColor="#ABABAB"
              editable={!verifyingSignOtp && !requestingSignOtp}
              returnKeyType="done"
              onSubmitEditing={handleVerifySignOtp}
            />
            <View style={styles.actionRow}>
              <Pressable
                style={[styles.modalSecondaryBtn, requestingSignOtp && styles.actionConfirmButtonDisabled]}
                onPress={() => handleRequestSignOtp(false)}
                disabled={requestingSignOtp || verifyingSignOtp}
              >
                <Text style={styles.modalSecondaryBtnText}>
                  {requestingSignOtp ? "Gönderiliyor..." : "Kodu Yeniden Gönder"}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.modalSecondaryBtn, requestingSignOtp && styles.actionConfirmButtonDisabled]}
                onPress={() => handleRequestSignOtp(true)}
                disabled={requestingSignOtp || verifyingSignOtp || !signOtpPhone.trim()}
              >
                <Text style={styles.modalSecondaryBtnText}>Numarayı Güncelle ve Gönder</Text>
              </Pressable>
            </View>
            <Pressable
              style={[
                styles.modalCloseBtn,
                (verifyingSignOtp || requestingSignOtp) && styles.actionConfirmButtonDisabled,
              ]}
              onPress={handleVerifySignOtp}
              disabled={verifyingSignOtp || requestingSignOtp || !signOtpCode.trim()}
            >
              <Text style={styles.modalCloseBtnText}>
                {verifyingSignOtp ? "Doğrulanıyor..." : "Kodu Doğrula"}
              </Text>
            </Pressable>
            <Pressable
              style={styles.modalSecondaryBtn}
              onPress={() => {
                if (verifyingSignOtp || requestingSignOtp) return;
                setSignOtpAction(null);
                setSignOtpCode("");
                setSignOtpPhone("");
              }}
            >
              <Text style={styles.modalSecondaryBtnText}>Kapat</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "600",
    letterSpacing: -0.5,
    color: "#000",
  },
  messagesContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  bubble: {
    maxWidth: "80%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
  },
  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: "#000",
  },
  aiBubble: {
    alignSelf: "flex-start",
    backgroundColor: "#F2F2F2",
  },
  loadingBubble: {
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 22,
  },
  userText: {
    color: "#fff",
  },
  aiText: {
    color: "#000",
  },
  actionButton: {
    marginTop: 8,
    alignSelf: "flex-start",
    backgroundColor: "#000",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  actionButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
    flexWrap: "wrap",
  },
  actionConfirmButton: {
    alignSelf: "flex-start",
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: "#000",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  actionConfirmButtonDisabled: {
    opacity: 0.6,
  },
  actionConfirmButtonText: {
    color: "#000",
    fontSize: 13,
    fontWeight: "700",
  },
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
  modalCloseBtn: {
    alignSelf: "flex-end",
    backgroundColor: "#000",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    marginTop: 4,
  },
  modalCloseBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  modalSecondaryBtn: {
    alignSelf: "flex-end",
    backgroundColor: "#EEE",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  modalSecondaryBtnText: {
    color: "#333",
    fontSize: 13,
    fontWeight: "600",
  },
  otpInput: {
    height: 46,
    borderWidth: 1.2,
    borderColor: "#DCDCDC",
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    color: "#000",
    backgroundColor: "#FAFAFA",
    marginTop: 8,
  },
});
