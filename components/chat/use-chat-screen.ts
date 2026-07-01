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
  const [signOtpAction, setSignOtpAction] = useState<ChatMessageAction | null>(
    null,
  );
  const [signOtpCode, setSignOtpCode] = useState("");
  const [signOtpPhone, setSignOtpPhone] = useState("");
  const [verifyingSignOtp, setVerifyingSignOtp] = useState(false);
  const [requestingSignOtp, setRequestingSignOtp] = useState(false);
  const [openingConversationId, setOpeningConversationId] = useState<
    string | null
  >(null);
  const scrollRef = useRef<ScrollView>(null);
  const sendingRef = useRef(false);

  const {
    scrollToBottom,
    stopDeltaDrain,
    waitUntilDeltaQueueEmpty,
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
    setSignOtpAction(null);
    setSignOtpCode("");
    setSignOtpPhone("");
    setConfirmingDraftUuid(null);
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
  }, [sessionLabel, loadConversationId, loadKey, hydrateConversationById, scrollToBottom]);

  useEffect(() => {
    if (!sessionLabel || !resetKey) return;
    setMessages([]);
    setConversationId(null);
    clearChatChrome();
  }, [sessionLabel, resetKey, clearChatChrome]);

  const handleSend = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sendingRef.current) return;

      try {
        const tokens = await getTokens();
        if (!tokens) return;
        sendingRef.current = true;

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
        setMessages((prev) => [
          ...prev,
          { id: assistId, text: "", role: "assistant" },
        ]);

        const isNewThread = conversationId === null;
        try {
          const res = await streamChat(
            { message: trimmed, conversationId },
            {
              onMeta: (nid) => {
                setConversationId((prev) => prev ?? nid);
              },
              onDelta: (t) => {
                pushDelta(t);
              },
              onTool: async (phase, name) => {
                const label = await onToolPhase(phase, name);
                if (label) setStreamingStatus(label);
              },
            },
          );

          setConversationId((prev) => prev ?? res.conversationId);
          const finalText = finalizeStreamedText(res.message);
          await waitUntilDeltaQueueEmpty();

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
            res.action?.type === "open_sign_otp" &&
            res.action.sign_otp?.draftUuid
          ) {
            setSignOtpAction(res.action);
          }
          if (
            res.action?.type === "open_invoice_preview" &&
            (res.action.preview?.uuid || res.action.preview?.html)
          ) {
            setPreviewAction(res.action);
          }
          if (isNewThread && res.conversationId)
            void refreshConversationList("none");
        } catch (err) {
          setMessages((prev) => [
            ...prev.filter((m) => m.id !== assistId),
            {
              id: newChatMessageId(),
              text: userFacingApiError(err),
              role: "assistant",
            },
          ]);
        }
      } finally {
        stopDeltaDrain();
        sendingRef.current = false;
        setStreaming(false);
        setStreamingStatus(null);
        setStreamingMessageId(null);
        scrollToBottom();
      }
    },
    [
      conversationId,
      finalizeStreamedText,
      onToolPhase,
      pushDelta,
      refreshConversationList,
      resetStreamBuffers,
      scrollToBottom,
      startDeltaDrain,
      stopDeltaDrain,
      waitUntilDeltaQueueEmpty,
    ],
  );

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
        if (
          aiMsg.action?.type === "open_sign_otp" &&
          aiMsg.action.sign_otp?.draftUuid
        ) {
          setSignOtpAction(aiMsg.action);
        }
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

  const handleVerifySignOtp = useCallback(async () => {
    if (
      !(await getTokens()) ||
      !conversationId ||
      !signOtpAction?.sign_otp?.draftUuid
    )
      return;
    const code = signOtpCode.trim();
    if (!code || verifyingSignOtp) return;
    setVerifyingSignOtp(true);
    setLoading(true);
    try {
      const aiMsg = await appendChatActionResponse(conversationId, {
        type: "verify_sign_otp",
        draftUuid: signOtpAction.sign_otp.draftUuid,
        smsCode: code,
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
      setVerifyingSignOtp(false);
      setLoading(false);
      setSignOtpAction(null);
      setSignOtpCode("");
      setSignOtpPhone("");
      scrollToBottom();
    }
  }, [conversationId, signOtpAction, signOtpCode, verifyingSignOtp, scrollToBottom]);

  const handleRequestSignOtp = useCallback(
    async (withPhoneUpdate: boolean) => {
      if (
        !(await getTokens()) ||
        !conversationId ||
        !signOtpAction?.sign_otp?.draftUuid
      )
        return;
      if (requestingSignOtp) return;
      const phone = signOtpPhone.trim();
      if (withPhoneUpdate && !phone) return;
      setRequestingSignOtp(true);
      setLoading(true);
      try {
        const aiMsg = await appendChatActionResponse(conversationId, {
          type: "request_sign_otp",
          draftUuid: signOtpAction.sign_otp.draftUuid,
          phone: withPhoneUpdate ? phone : undefined,
        });
        setMessages((prev) => [...prev, aiMsg]);
        if (
          aiMsg.action?.type === "open_sign_otp" &&
          aiMsg.action.sign_otp?.draftUuid
        ) {
          setSignOtpAction(aiMsg.action);
        }
        if (withPhoneUpdate) setSignOtpPhone("");
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
        setRequestingSignOtp(false);
        setLoading(false);
        scrollToBottom();
      }
    },
    [conversationId, requestingSignOtp, signOtpAction, signOtpPhone, scrollToBottom],
  );

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setConversationId(null);
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

  const dismissSignOtp = useCallback(() => {
    setSignOtpAction(null);
    setSignOtpCode("");
    setSignOtpPhone("");
  }, []);

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
  };
}
