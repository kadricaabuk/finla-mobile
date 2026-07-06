import ChatInput from "@/components/chat-input";
import { ChatMessageBubble } from "@/components/chat/chat-message-bubble";
import { InvoiceDetailModal } from "@/components/chat/invoice-detail-modal";
import { InvoicePreviewModal } from "@/components/chat/invoice-preview-modal";
import { useChatScreen } from "@/components/chat/use-chat-screen";
import { useExamplePrompts } from "@/components/chat/use-example-prompts";
import { IconHeaderButton } from "@/components/layout/icon-header-button";
import { useMainAppShell } from "@/contexts/main-app-shell-context";
import { useKeyboardAvoidancePadding } from "@/hooks/use-keyboard";
import { useRegisterMainShellSideMenu } from "@/hooks/use-register-main-shell-side-menu";
import { splitQuickReplies } from "@/lib/chat-quick-replies";
import { shareExcelDownload } from "@/lib/excel-share";
import type { ChatMessageAction } from "@/types/chat-actions";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

const CHAT_SHELL_OWNER_ID = "screen-chat";

export default function ChatScreen() {
  const keyboardAvoidPaddingStyle = useKeyboardAvoidancePadding();
  const { openMenu } = useMainAppShell();
  const [inputFocused, setInputFocused] = useState(false);
  const {
    scrollRef,
    messages,
    loading,
    streaming,
    streamingStatus,
    streamingMessageId,
    conversationId,
    detailAction,
    detailInvoice,
    previewAction,
    confirmingDraftUuid,
    openingConversationId,
    draftInput,
    consumeDraftInput,
    prefillInput,
    setDetailAction,
    setPreviewAction,
    handleSend,
    handleCancelStream,
    handleConfirmFromPreview,
    handleNewChat,
    handleOpenConversation,
  } = useChatScreen();

  const examplePrompts = useExamplePrompts();

  const handleShareExcelExport = useCallback(
    async (action: ChatMessageAction | undefined) => {
      const url = action?.excel_export?.download_url;
      const name = action?.excel_export?.file_name;
      if (!url || !name) {
        Alert.alert(
          "Excel",
          "İndirilecek bağlantı bulunamadı. Tekrar excel istemeyi dene.",
        );
        return;
      }
      const res = await shareExcelDownload(url, name);
      if (!res.ok) {
        Alert.alert("Excel", res.message);
      }
    },
    [],
  );

  const sideMenuBindings = useMemo(
    () => ({
      activeScreen: "chat" as const,
      openingConversationId,
      activeConversationId: conversationId,
      onNewChat: handleNewChat,
      onOpenConversation: handleOpenConversation,
    }),
    [
      conversationId,
      handleNewChat,
      handleOpenConversation,
      openingConversationId,
    ],
  );

  useRegisterMainShellSideMenu(CHAT_SHELL_OWNER_ID, sideMenuBindings);

  // Detay aksiyonundan fatura yönünü çıkar: fatura payload'ındaki direction
  // öncelikli, yoksa aksiyon filtresi. Bilinmiyorsa buton gösterilmez.
  const detailDirection = useMemo(() => {
    const invDir = (detailInvoice as { direction?: unknown } | null)?.direction;
    if (invDir === "outgoing" || invDir === "incoming") return invDir;
    return detailAction?.filter?.direction;
  }, [detailInvoice, detailAction]);

  const handleReissueFromDetail = useCallback(
    (message: string) => {
      setDetailAction(null);
      prefillInput(message);
    },
    [prefillInput, setDetailAction],
  );

  // Hızlı yanıt çipleri: yalnızca son mesaj bir asistan sorusuysa ve stream
  // bittiyse gösterilir; dokununca metin aynen gönderilir.
  const lastMessage = messages[messages.length - 1];
  const quickReplies = useMemo(() => {
    if (loading || streaming) return [];
    if (!lastMessage || lastMessage.role !== "assistant") return [];
    return splitQuickReplies(lastMessage.text ?? "").replies;
  }, [lastMessage, loading, streaming]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <IconHeaderButton
          testID="header-menu"
          name="menu"
          onPress={openMenu}
          accessibilityLabel="Menü"
        />
        <Text style={styles.title}>finla</Text>
        <View style={styles.headerBtnSpacer} />
      </View>

      <Animated.View style={[styles.flex, keyboardAvoidPaddingStyle]}>
        <View style={styles.chatBody}>
          <ScrollView
            ref={scrollRef}
            style={styles.flex}
            contentContainerStyle={styles.messagesContent}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="none"
            keyboardShouldPersistTaps="always"
          >
            {messages.length === 0 &&
              inputFocused &&
              !loading &&
              !openingConversationId && (
                <View style={styles.emptyState}>
                  {examplePrompts.map((prompt, index) => (
                    <Animated.View
                      key={prompt.text}
                      entering={FadeInDown.duration(200).delay(index * 40)}
                    >
                      <TouchableOpacity
                        style={styles.promptRow}
                        activeOpacity={0.6}
                        disabled={loading || streaming}
                        onPress={() => handleSend(prompt.text)}
                      >
                        <View style={styles.promptIconWrap}>
                          <Ionicons
                            name={prompt.icon}
                            size={15}
                            color="#1A1A2E"
                          />
                        </View>
                        <Text style={styles.promptText}>{prompt.text}</Text>
                      </TouchableOpacity>
                    </Animated.View>
                  ))}
                </View>
              )}

            {messages.map((msg) => (
              <ChatMessageBubble
                key={msg.id}
                msg={msg}
                confirmingDraftUuid={confirmingDraftUuid ?? undefined}
                streamPending={
                  streaming &&
                  msg.role === "assistant" &&
                  streamingMessageId !== null &&
                  msg.id === streamingMessageId
                }
                streamStatusLabel={
                  streaming &&
                  streamingMessageId === msg.id &&
                  msg.role === "assistant"
                    ? (streamingStatus ?? "Düşünüyor…")
                    : null
                }
                onOpenInvoiceDetail={(action) =>
                  setDetailAction(action ?? null)
                }
                onOpenInvoicePreview={(action) =>
                  setPreviewAction(action ?? null)
                }
                onConfirmPreview={handleConfirmFromPreview}
                onShareExcelExport={handleShareExcelExport}
              />
            ))}

            {loading && !streaming && (
              <View
                style={[styles.bubble, styles.aiBubble, styles.loadingBubble]}
              >
                <ActivityIndicator size="small" color="#888" />
              </View>
            )}

            {quickReplies.length > 0 && (
              <View style={styles.quickReplyRow}>
                {quickReplies.map((reply) => (
                  <TouchableOpacity
                    key={reply}
                    testID="chat-quick-reply"
                    style={styles.quickReplyChip}
                    activeOpacity={0.7}
                    onPress={() => void handleSend(reply)}
                  >
                    <Text style={styles.quickReplyText}>{reply}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </ScrollView>
        </View>

        <ChatInput
          disabled={loading || streaming}
          streaming={streaming}
          onStop={handleCancelStream}
          onFocusChange={setInputFocused}
          onSend={handleSend}
          draftText={draftInput}
          onDraftConsumed={consumeDraftInput}
        />
      </Animated.View>

      <InvoiceDetailModal
        visible={Boolean(detailAction?.invoice)}
        invoice={detailInvoice}
        direction={detailDirection}
        onReissue={handleReissueFromDetail}
        onClose={() => setDetailAction(null)}
      />

      <InvoicePreviewModal
        action={previewAction}
        conversationId={conversationId}
        onClose={() => setPreviewAction(null)}
      />
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
  chatBody: {
    flex: 1,
    position: "relative",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E4E5EC",
  },
  headerBtnSpacer: {
    width: 40,
    height: 40,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.8,
    color: "#000",
  },
  messagesContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  emptyState: {
    flex: 1,
    justifyContent: "flex-end",
    paddingBottom: 4,
    paddingHorizontal: 4,
    gap: 4,
  },
  promptRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },
  promptIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#F2F4FD",
    alignItems: "center",
    justifyContent: "center",
  },
  promptText: {
    flex: 1,
    fontSize: 15,
    color: "#1A1A2E",
  },
  bubble: {
    maxWidth: "80%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
  },
  aiBubble: {
    alignSelf: "flex-start",
    backgroundColor: "#F3F4F9",
  },
  loadingBubble: {
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  quickReplyRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 2,
  },
  quickReplyChip: {
    borderWidth: 1,
    borderColor: "#D9D9D9",
    borderRadius: 999,
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  quickReplyText: {
    fontSize: 14,
    color: "#000",
    fontWeight: "500",
  },
  cancelStreamBtn: {
    alignSelf: "center",
    paddingVertical: 6,
    paddingHorizontal: 14,
    marginBottom: 4,
  },
  cancelStreamText: {
    fontSize: 14,
    color: "#666",
    fontWeight: "500",
  },
});
