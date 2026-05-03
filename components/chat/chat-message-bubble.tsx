import { chatMarkdownStyles } from "@/constants/chat-markdown-styles";
import { hasMarkdownTable } from "@/lib/markdown-table";
import type { ChatMessage } from "@/types/chat-actions";
import { router } from "expo-router";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Markdown from "react-native-markdown-display";

interface ChatMessageBubbleProps {
  msg: ChatMessage;
  confirmingDraftUuid: string | undefined;
  /** Stream bitene kadar soluk balon + içerik (üstte sabit durum satırı kullanılır). */
  streamPending?: boolean;
  onOpenInvoiceDetail: (action: ChatMessage["action"]) => void;
  onOpenInvoicePreview: (action: ChatMessage["action"]) => void;
  onConfirmPreview: (draftUuid: string | undefined) => void;
}

export function ChatMessageBubble({
  msg,
  confirmingDraftUuid,
  streamPending,
  onOpenInvoiceDetail,
  onOpenInvoicePreview,
  onConfirmPreview,
}: ChatMessageBubbleProps) {
  const pending = Boolean(streamPending && msg.role === "assistant");
  if (msg.role === "assistant" && pending && msg.text.trim().length === 0) {
    return null;
  }

  const bubbleStyles = [
    styles.bubble,
    msg.role === "user"
      ? styles.userBubble
      : pending
        ? styles.aiBubblePending
        : styles.aiBubble,
  ];
  const markdownWrap = pending ? styles.markdownPendingWrap : undefined;

  return (
    <View style={bubbleStyles}>
      {msg.role === "user" ? (
        <Text style={[styles.bubbleText, styles.userText]}>{msg.text}</Text>
      ) : hasMarkdownTable(msg.text) ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={markdownWrap}>
            <Markdown style={chatMarkdownStyles}>{msg.text}</Markdown>
          </View>
        </ScrollView>
      ) : (
        <View style={markdownWrap}>
          <Markdown style={chatMarkdownStyles}>{msg.text}</Markdown>
        </View>
      )}
      {msg.role === "assistant" && msg.action?.type === "open_invoices" && (
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
                    ? String(msg.action.filter.amountGte)
                    : undefined,
                amountEq:
                  typeof msg.action?.filter?.amountEq === "number"
                    ? String(msg.action.filter.amountEq)
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
        msg.action.invoice && (
          <TouchableOpacity
            style={styles.actionButton}
            activeOpacity={0.8}
            onPress={() => onOpenInvoiceDetail(msg.action)}
          >
            <Text style={styles.actionButtonText}>
              {msg.action.label || "Detayı Gör"}
            </Text>
          </TouchableOpacity>
        )}
      {msg.role === "assistant" &&
        msg.action?.type === "open_invoice_preview" &&
        (msg.action.preview?.html || msg.action.preview?.uuid) && (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.actionButton}
              activeOpacity={0.8}
              onPress={() => onOpenInvoicePreview(msg.action)}
            >
              <Text style={styles.actionButtonText}>
                {msg.action.label || "Faturayı Gör"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.actionConfirmButton,
                confirmingDraftUuid === msg.action.preview?.uuid &&
                  styles.actionConfirmButtonDisabled,
              ]}
              activeOpacity={0.8}
              disabled={confirmingDraftUuid === msg.action.preview?.uuid}
              onPress={() => onConfirmPreview(msg.action?.preview?.uuid)}
            >
              <Text style={styles.actionConfirmButtonText}>
                {confirmingDraftUuid === msg.action.preview?.uuid
                  ? "Onaylanıyor..."
                  : "Onayla ve Kes"}
              </Text>
            </TouchableOpacity>
          </View>
        )}
    </View>
  );
}

const styles = StyleSheet.create({
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
  aiBubblePending: {
    alignSelf: "flex-start",
    backgroundColor: "#EAEAEA",
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  markdownPendingWrap: {
    opacity: 0.58,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 22,
  },
  userText: {
    color: "#fff",
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
});
