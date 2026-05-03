import ChatInput from "@/components/chat-input";
import { ChatMessageBubble } from "@/components/chat/chat-message-bubble";
import { InvoiceDetailModal } from "@/components/chat/invoice-detail-modal";
import { InvoicePreviewModal } from "@/components/chat/invoice-preview-modal";
import { SignOtpModal } from "@/components/chat/sign-otp-modal";
import { useChatScreen } from "@/components/chat/use-chat-screen";
import { IconHeaderButton } from "@/components/layout/icon-header-button";
import { useMainAppShell } from "@/contexts/main-app-shell-context";
import { useKeyboardAvoidancePadding } from "@/hooks/use-keyboard";
import { useRegisterMainShellSideMenu } from "@/hooks/use-register-main-shell-side-menu";
import { useMemo } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
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
    signOtpAction,
    signOtpCode,
    signOtpPhone,
    verifyingSignOtp,
    requestingSignOtp,
    openingConversationId,
    setDetailAction,
    setPreviewAction,
    setSignOtpCode,
    setSignOtpPhone,
    handleSend,
    handleConfirmFromPreview,
    handleVerifySignOtp,
    handleRequestSignOtp,
    handleNewChat,
    handleOpenConversation,
    dismissSignOtp,
  } = useChatScreen();

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

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <IconHeaderButton
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
              />
            ))}

            {loading && !streaming && (
              <View
                style={[styles.bubble, styles.aiBubble, styles.loadingBubble]}
              >
                <ActivityIndicator size="small" color="#888" />
              </View>
            )}
          </ScrollView>
        </View>

        <ChatInput disabled={loading || streaming} onSend={handleSend} />
      </Animated.View>

      <InvoiceDetailModal
        visible={Boolean(detailAction?.invoice)}
        invoice={detailInvoice}
        onClose={() => setDetailAction(null)}
      />

      <InvoicePreviewModal
        action={previewAction}
        onClose={() => setPreviewAction(null)}
      />

      <SignOtpModal
        action={signOtpAction}
        signOtpCode={signOtpCode}
        signOtpPhone={signOtpPhone}
        verifyingSignOtp={verifyingSignOtp}
        requestingSignOtp={requestingSignOtp}
        onChangeCode={setSignOtpCode}
        onChangePhone={setSignOtpPhone}
        onVerify={handleVerifySignOtp}
        onResend={() => handleRequestSignOtp(false)}
        onUpdatePhoneAndSend={() => handleRequestSignOtp(true)}
        onDismiss={dismissSignOtp}
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
});
