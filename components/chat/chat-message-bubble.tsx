import { chatMarkdownStyles } from "@/constants/chat-markdown-styles";
import { stripQuickRepliesForDisplay } from "@/lib/chat-quick-replies";
import { hasMarkdownTable } from "@/lib/markdown-table";
import type { ChatMessage } from "@/types/chat-actions";
import { router } from "expo-router";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Markdown from "react-native-markdown-display";

interface ChatMessageBubbleProps {
  msg: ChatMessage;
  confirmingDraftUuid: string | undefined;
  /** Stream bitene kadar soluk balon; yanıt metni gelene kadar streamStatusLabel gösterilir. */
  streamPending?: boolean;
  /** Yalnızca streamPending + boş asistan metni iken (düşünüyor / araştırıyor vb.). */
  streamStatusLabel?: string | null;
  onOpenInvoiceDetail: (action: ChatMessage["action"]) => void;
  onOpenInvoicePreview: (action: ChatMessage["action"]) => void;
  onConfirmPreview: (draftUuid: string | undefined) => void;
  /** Excel çıktısı: imzalı URL indir ve paylaş */
  onShareExcelExport?: (action: ChatMessage["action"]) => void;
}

export function ChatMessageBubble({
  msg,
  confirmingDraftUuid,
  streamPending,
  streamStatusLabel,
  onOpenInvoiceDetail,
  onOpenInvoicePreview,
  onConfirmPreview,
  onShareExcelExport,
}: ChatMessageBubbleProps) {
  const pending = Boolean(streamPending && msg.role === "assistant");
  // Öneri çipi satırı ([öneriler: …]) balon metninde gizlenir; çipler
  // chat-screen tarafından yalnızca son asistan mesajı için çizilir.
  const messageText =
    msg.role === "assistant"
      ? stripQuickRepliesForDisplay(msg.text ?? "")
      : (msg.text ?? "");
  const showStreamStatusBubble =
    msg.role === "assistant" &&
    pending &&
    messageText.trim().length === 0;

  if (showStreamStatusBubble) {
    const label =
      streamStatusLabel && streamStatusLabel.trim().length > 0
        ? streamStatusLabel
        : "Düşünüyor…";
    return (
      <View style={[styles.bubble, styles.aiBubblePending]}>
        <View style={styles.streamStatusRow}>
          <ActivityIndicator size="small" color="#888" />
          <Text style={styles.streamStatusText} numberOfLines={3}>
            {label}
          </Text>
        </View>
      </View>
    );
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
    <View
      testID={msg.role === "assistant" ? "chat-assistant-message" : "chat-user-message"}
      style={bubbleStyles}
    >
      {msg.role === "user" ? (
        <Text style={[styles.bubbleText, styles.userText]}>{messageText}</Text>
      ) : hasMarkdownTable(messageText) ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={markdownWrap}>
            <Markdown style={chatMarkdownStyles}>{messageText}</Markdown>
          </View>
        </ScrollView>
      ) : (
        <View style={markdownWrap}>
          <Markdown style={chatMarkdownStyles}>{messageText || " "}</Markdown>
        </View>
      )}
      {msg.role === "assistant" && msg.action?.type === "open_invoices" && (
        <TouchableOpacity
          style={styles.actionButton}
          activeOpacity={0.8}
          onPress={() => {
            const filter = msg.action?.filter;
            const isIncoming = filter?.direction === "incoming";
            router.push({
              pathname: isIncoming ? "/incoming-invoices" : "/outgoing-invoices",
              params: {
                startDate: filter?.startDate,
                endDate: filter?.endDate,
                customerName: filter?.customerName,
                amountGte:
                  typeof filter?.amountGte === "number"
                    ? String(filter.amountGte)
                    : undefined,
                amountEq:
                  typeof filter?.amountEq === "number"
                    ? String(filter.amountEq)
                    : undefined,
                source: "chat",
              },
            });
          }}
        >
          <Text style={styles.actionButtonText}>
            {msg.action.label ||
              (msg.action.filter?.direction === "incoming"
                ? "Gelen Faturaları Gör"
                : "Giden Faturaları Gör")}
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
        msg.action?.type === "open_excel_export" &&
        msg.action.excel_export?.download_url &&
        typeof onShareExcelExport === "function" && (
          <TouchableOpacity
            style={styles.actionButton}
            activeOpacity={0.8}
            onPress={() => onShareExcelExport(msg.action)}
          >
            <Text style={styles.actionButtonText}>
              {(msg.action.label?.trim() ?? "").startsWith("Excel")
                ? (msg.action.label ?? "Excel")
                : msg.action.label || "Excel'i indir / paylaş"}
            </Text>
          </TouchableOpacity>
        )}
      {msg.role === "assistant" &&
        msg.action?.type === "open_excel_export" &&
        !msg.action.excel_export?.download_url && (
          <Text style={styles.expiredHint} numberOfLines={2}>
            Excel bağlantısının süresi dolmuş olabilir; sohbette yeniden
            isteyebilirsin.
          </Text>
        )}
      {msg.role === "assistant" &&
        msg.action?.type === "open_invoice_preview" &&
        (msg.action.preview?.html || msg.action.preview?.uuid) && (
          <View
            style={
              msg.action.preview?.issued === false
                ? styles.actionRow
                : undefined
            }
          >
            <TouchableOpacity
              style={styles.actionButton}
              activeOpacity={0.8}
              onPress={() => onOpenInvoicePreview(msg.action)}
            >
              <Text style={styles.actionButtonText}>
                {msg.action.label || "Faturayı Gör"}
              </Text>
            </TouchableOpacity>
            {msg.action.preview?.issued === false ? (
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
            ) : null}
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
  streamStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  streamStatusText: {
    flexShrink: 1,
    fontSize: 15,
    lineHeight: 22,
    color: "#555",
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
  expiredHint: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 17,
    color: "#777",
    fontStyle: "italic",
  },
});
