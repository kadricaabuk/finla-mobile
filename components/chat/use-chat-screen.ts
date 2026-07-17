import {
  appendChatActionResponse,
  isHiddenUserActionContent,
  newChatMessageId,
} from "@/components/chat/chat-action-response";
import { useChatStreamDisplay } from "@/components/chat/use-chat-stream-display";
import { useMainAppShell } from "@/contexts/main-app-shell-context";
import { useScrollToEndOnKeyboard } from "@/hooks/use-scroll-to-end-on-keyboard";
import { getTokens } from "@/lib/session";
import { callApi, streamChat, userFacingApiError } from "@/lib/supabase";
import type {
  ConversationMessagesResponse,
  InvoiceDetailResponse,
} from "@/types/api-responses";
import type {
  ChatMessage,
  ChatMessageAction,
  InvoiceDetail,
} from "@/types/chat-actions";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, type ScrollView } from "react-native";

function parseStoredChatAction(raw: unknown): ChatMessage["action"] {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  if (typeof o.type !== "string") return undefined;
  return raw as ChatMessage["action"];
}

export function useChatScreen() {
  const { sessionLabel, refreshConversationList, closeMenu } =
    useMainAppShell();
  const routeParams = useLocalSearchParams<{
    loadConversationId?: string;
    loadKey?: string;
    resetKey?: string;
    draftMessage?: string;
    draftKey?: string;
  }>();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamingStatus, setStreamingStatus] = useState<string | null>(null);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(
    null,
  );
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [detailAction, setDetailAction] = useState<ChatMessageAction | null>(
    null,
  );
  const [detailInvoice, setDetailInvoice] = useState<InvoiceDetail | null>(
    null,
  );
  const [previewAction, setPreviewAction] = useState<ChatMessageAction | null>(
    null,
  );
  const [confirmingDraftUuid, setConfirmingDraftUuid] = useState<string | null>(
    null,
  );
  const [openingConversationId, setOpeningConversationId] = useState<
    string | null
  >(null);
  // Long-press "Düzenle": the last user message being edited; on send the
  // exchange from this message onward is removed and the edit is resent.
  const [editingMessage, setEditingMessage] = useState<{
    id: string;
    text: string;
  } | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const sendingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const STREAM_IDLE_MS = 60_000;

  const clearStreamIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const armStreamIdleTimer = useCallback(() => {
    clearStreamIdleTimer();
    idleTimerRef.current = setTimeout(() => {
      abortRef.current?.abort();
    }, STREAM_IDLE_MS);
  }, [clearStreamIdleTimer]);

  const {
    scrollToBottom,
    stopDeltaDrain,
    startDeltaDrain,
    resetStreamBuffers,
    pushDelta,
    onToolPhase,
    finalizeStreamedText,
  } = useChatStreamDisplay(scrollRef, setMessages);

  useScrollToEndOnKeyboard(scrollRef);

  useEffect(() => {
    const loadDetail = async () => {
      if (
        !sessionLabel ||
        detailAction?.type !== "open_invoice_detail" ||
        !detailAction.invoice?.invoice_uuid
      ) {
        setDetailInvoice(detailAction?.invoice ?? null);
        return;
      }
      try {
        const res = await callApi<InvoiceDetailResponse>("invoice-detail", {
          invoiceUuid: detailAction.invoice.invoice_uuid,
        });
        setDetailInvoice(res.invoice ?? detailAction.invoice);
      } catch {
        setDetailInvoice(detailAction.invoice);
      }
    };
    void loadDetail();
  }, [sessionLabel, detailAction]);

  const clearChatChrome = useCallback(() => {
    setPreviewAction(null);
    setDetailAction(null);
    setDetailInvoice(null);
    setConfirmingDraftUuid(null);
    setEditingMessage(null);
  }, []);

  const hydrateConversationById = useCallback(
    async (id: string) => {
      const res = await callApi<ConversationMessagesResponse>("conversations", {
        action: "messages",
        conversationId: id,
      });
      const rows = res.messages ?? [];
      setConversationId(id);
      clearChatChrome();
      setMessages(
        rows
          .filter(
            (m) =>
              m.role !== "user" ||
              !isHiddenUserActionContent(String(m.content ?? "")),
          )
          .map((m) => ({
            id: m.id,
            text: m.content,
            role: m.role as "user" | "assistant",
            action:
              m.role === "assistant"
                ? parseStoredChatAction(m.action)
                : undefined,
          })),
      );
    },
    [clearChatChrome],
  );

  const loadConversationId =
    typeof routeParams.loadConversationId === "string"
      ? routeParams.loadConversationId
      : undefined;
  const loadKey =
    typeof routeParams.loadKey === "string" ? routeParams.loadKey : undefined;
  const resetKey =
    typeof routeParams.resetKey === "string" ? routeParams.resetKey : undefined;
  const draftMessage =
    typeof routeParams.draftMessage === "string"
      ? routeParams.draftMessage
      : undefined;
  const draftKey =
    typeof routeParams.draftKey === "string" ? routeParams.draftKey : undefined;

  const [draftInput, setDraftInput] = useState<string | null>(null);
  // True when the screen was opened with a ready prompt (e.g. "reissue" from
  // outgoing invoices) — hides empty-chat suggestions; reset on new chat/reset.
  const [hasRouteDraft, setHasRouteDraft] = useState(false);
  const consumedDraftKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!draftMessage || !draftKey) return;
    if (consumedDraftKeyRef.current === draftKey) return;
    consumedDraftKeyRef.current = draftKey;
    setDraftInput(draftMessage);
    setHasRouteDraft(true);
  }, [draftMessage, draftKey]);

  const consumeDraftInput = useCallback(() => {
    setDraftInput(null);
  }, []);

  /** Aynı ekrandan (ör. fatura detay modalı) input'u taslakla doldurur. */
  const prefillInput = useCallback((text: string) => {
    setDraftInput(text);
  }, []);

  useEffect(() => {
    if (!sessionLabel || !loadConversationId || !loadKey) return;
    let cancelled = false;
    void (async () => {
      setOpeningConversationId(loadConversationId);
      try {
        await hydrateConversationById(loadConversationId);
        if (!cancelled) scrollToBottom();
      } catch (err) {
        if (!cancelled) {
          Alert.alert("Sohbet", userFacingApiError(err));
        }
      } finally {
        if (!cancelled) setOpeningConversationId(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    sessionLabel,
    loadConversationId,
    loadKey,
    hydrateConversationById,
    scrollToBottom,
  ]);

  useEffect(() => {
    if (!sessionLabel || !resetKey) return;
    setMessages([]);
    setConversationId(null);
    setHasRouteDraft(false);
    clearChatChrome();
  }, [sessionLabel, resetKey, clearChatChrome]);

  const handleSend = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sendingRef.current) return;

      const editing = editingMessage;
      if (editing && trimmed === editing.text.trim()) {
        // Nothing changed — leave edit mode without resending.
        setEditingMessage(null);
        return;
      }

      const tokens = await getTokens();
      if (!tokens) {
        throw new Error("Oturum bulunamadı. Lütfen tekrar giriş yapın.");
      }

      sendingRef.current = true;
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      const streamSignal = abortRef.current.signal;

      // Edit-resend: drop the old exchange locally in the same render as the
      // new message; the server truncates it inside the chat request itself
      // (replaceLastExchange) — no extra round trip.
      const replaceLastExchange = Boolean(editing && conversationId);
      if (editing) {
        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.id === editing.id);
          return idx >= 0 ? prev.slice(0, idx) : prev;
        });
        setEditingMessage(null);
      }

      try {
        const userMsg: ChatMessage = {
          id: newChatMessageId(),
          text: trimmed,
          role: "user",
        };
        setMessages((prev) => [...prev, userMsg]);
        setStreaming(true);
        setStreamingStatus("Düşünüyor…");
        scrollToBottom();

        const assistId = newChatMessageId();
        setStreamingMessageId(assistId);
        resetStreamBuffers();
        startDeltaDrain(assistId);
        armStreamIdleTimer();
        setMessages((prev) => [
          ...prev,
          { id: assistId, text: "", role: "assistant" },
        ]);

        const isNewThread = conversationId === null;
        try {
          const res = await streamChat(
            { message: trimmed, conversationId, replaceLastExchange },
            {
              onMeta: (nid) => {
                setConversationId((prev) => prev ?? nid);
              },
              onDelta: (t) => {
                pushDelta(t);
                armStreamIdleTimer();
              },
              onTool: async (phase, name) => {
                const label = await onToolPhase(phase, name);
                if (label) setStreamingStatus(label);
                armStreamIdleTimer();
              },
            },
            { signal: streamSignal },
          );

          setConversationId((prev) => prev ?? res.conversationId);
          stopDeltaDrain();
          const finalText = finalizeStreamedText(res.message ?? "");

          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistId
                ? {
                    ...m,
                    text: finalText,
                    action: res.action,
                  }
                : m,
            ),
          );

          if (
            res.action?.type === "open_invoice_preview" &&
            (res.action.preview?.uuid || res.action.preview?.html)
          ) {
            setPreviewAction(res.action);
          }
          if (isNewThread && res.conversationId)
            void refreshConversationList("none");
        } catch (err) {
          const aborted =
            err instanceof Error &&
            (err.name === "AbortError" || /aborted|abort/i.test(err.message));
          setMessages((prev) => [
            ...prev.filter((m) => m.id !== assistId),
            {
              id: newChatMessageId(),
              text: aborted ? "Yanıt durduruldu." : userFacingApiError(err),
              role: "assistant",
            },
          ]);
          throw err;
        }
      } finally {
        clearStreamIdleTimer();
        abortRef.current = null;
        stopDeltaDrain();
        sendingRef.current = false;
        setStreaming(false);
        setStreamingStatus(null);
        setStreamingMessageId(null);
        scrollToBottom();
      }
    },
    [
      armStreamIdleTimer,
      clearStreamIdleTimer,
      conversationId,
      editingMessage,
      finalizeStreamedText,
      onToolPhase,
      pushDelta,
      refreshConversationList,
      resetStreamBuffers,
      scrollToBottom,
      startDeltaDrain,
      stopDeltaDrain,
    ],
  );

  const handleCancelStream = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  /** Long-press "Düzenle": puts the message into the input as a draft. */
  const handleStartEditMessage = useCallback((msg: ChatMessage) => {
    setEditingMessage({ id: msg.id, text: msg.text ?? "" });
    setDraftInput(msg.text ?? "");
  }, []);

  const handleCancelEditMessage = useCallback(() => {
    setEditingMessage(null);
  }, []);

  const handleConfirmFromPreview = useCallback(
    async (draftUuid?: string) => {
      if (!(await getTokens()) || !conversationId || !draftUuid) return;
      if (confirmingDraftUuid === draftUuid) return;
      setConfirmingDraftUuid(draftUuid);
      setLoading(true);
      try {
        const aiMsg = await appendChatActionResponse(conversationId, {
          type: "confirm_pending_invoice",
          draftUuid,
        });
        setMessages((prev) => [...prev, aiMsg]);
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            id: newChatMessageId(),
            text: userFacingApiError(err),
            role: "assistant",
          },
        ]);
      } finally {
        setLoading(false);
        setConfirmingDraftUuid(null);
        scrollToBottom();
      }
    },
    [conversationId, confirmingDraftUuid, scrollToBottom],
  );

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setConversationId(null);
    setHasRouteDraft(false);
    clearChatChrome();
    closeMenu();
  }, [clearChatChrome, closeMenu]);

  const handleOpenConversation = useCallback(
    async (id: string) => {
      if (openingConversationId) return;
      setOpeningConversationId(id);
      try {
        await hydrateConversationById(id);
        closeMenu();
        scrollToBottom();
      } catch (err) {
        Alert.alert("Sohbet", userFacingApiError(err));
      } finally {
        setOpeningConversationId(null);
      }
    },
    [openingConversationId, hydrateConversationById, closeMenu, scrollToBottom],
  );

  return {
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
    hasRouteDraft,
    editingMessageId: editingMessage?.id ?? null,
    consumeDraftInput,
    prefillInput,
    setDetailAction,
    setPreviewAction,
    handleSend,
    handleCancelStream,
    handleStartEditMessage,
    handleCancelEditMessage,
    handleConfirmFromPreview,
    handleNewChat,
    handleOpenConversation,
  };
}
