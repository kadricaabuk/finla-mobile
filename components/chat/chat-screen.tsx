import ChatInput from "@/components/chat-input";
import { ChatMessageBubble } from "@/components/chat/chat-message-bubble";
import { InvoiceDetailModal } from "@/components/chat/invoice-detail-modal";
import { InvoicePreviewModal } from "@/components/chat/invoice-preview-modal";
import { useChatScreen } from "@/components/chat/use-chat-screen";
import { IconHeaderButton } from "@/components/layout/icon-header-button";
import { useMainAppShell } from "@/contexts/main-app-shell-context";
import { useKeyboardAvoidancePadding } from "@/hooks/use-keyboard";
import { useRegisterMainShellSideMenu } from "@/hooks/use-register-main-shell-side-menu";
import { splitQuickReplies } from "@/lib/chat-quick-replies";
import { shareExcelDownload } from "@/lib/excel-share";
import type { ChatMessageAction } from "@/types/chat-actions";
import { useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

const CHAT_SHELL_OWNER_ID = "screen-chat";

export default function ChatScreen() {
  const keyboardAvoidPaddingStyle = useKeyboardAvoidancePadding();
  const { openMenu } = useMainAppShell();
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
    setDetailAction,
    setPreviewAction,
    handleSend,
    handleCancelStream,
    handleConfirmFromPreview,
    handleNewChat,
    handleOpenConversation,
  } = useChatScreen();

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

        <ChatInput disabled={loading || streaming} onSend={handleSend} />
        {streaming && (
          <TouchableOpacity
            style={styles.cancelStreamBtn}
            onPress={handleCancelStream}
            accessibilityLabel="Yanıtı durdur"
          >
            <Text style={styles.cancelStreamText}>Durdur</Text>
          </TouchableOpacity>
        )}
      </Animated.View>

      <InvoiceDetailModal
        visible={Boolean(detailAction?.invoice)}
        invoice={detailInvoice}
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
  },
  headerBtnSpacer: {
    width: 40,
    height: 40,
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
  aiBubble: {
    alignSelf: "flex-start",
    backgroundColor: "#F2F2F2",
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
