import { useMainAppShell } from "@/contexts/main-app-shell-context";
import { useScrollToEndOnKeyboard } from "@/hooks/use-scroll-to-end-on-keyboard";
import { getTokens } from "@/lib/session";
import { callApi, streamChat, userFacingApiError } from "@/lib/supabase";
import type {
  ChatMessage,
  ChatMessageAction,
  InvoiceDetail,
} from "@/types/chat-actions";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, type ScrollView } from "react-native";

/** So very fast GİB round-trips still show the tool line (e.g. “Gelen faturalar…”) long enough to read. */
const MIN_TOOL_STATUS_DISPLAY_MS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function newChatMessageId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function parseStoredChatAction(raw: unknown): ChatMessage["action"] {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  if (typeof o.type !== "string") return undefined;
  return raw as ChatMessage["action"];
}

function toolStatusText(rawName: string): string {
  const first = rawName.split(",")[0]?.trim();
  const toolName = first && first.length > 0 ? first : rawName.trim();
  switch (toolName) {
    case "list_invoices":
      return "Faturalar araştırılıyor…";
    case "list_invoices_received":
      return "Gelen faturalar araştırılıyor…";
    case "latest_invoice":
      return "Son fatura aranıyor…";
    case "invoice_totals":
      return "Toplamlar araştırılıyor…";
    case "lookup_recipient":
      return "Alıcı bilgileri araştırılıyor…";
    case "get_exchange_rate":
      return "Döviz kuru alınıyor…";
    case "get_user_profile":
      return "Profil bilgileri alınıyor…";
    case "update_user_profile":
      return "Profil güncelleniyor…";
    case "create_invoice":
      return "Taslak fatura hazırlanıyor…";
    case "cancel_invoice":
      return "Fatura iptali işleniyor…";
    case "request_invoice_sign_otp":
      return "SMS doğrulama başlatılıyor…";
    case "verify_invoice_sign_otp":
      return "SMS kodu doğrulanıyor…";
    case "confirm_invoice_issue":
      return "Fatura kesiliyor…";
    case "export_invoices_excel":
      return "Excel dosyası oluşturuluyor…";
    default:
      return "İşleniyor…";
  }
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
  /** Stream sırasındaki geçici asistan mesajı; metin gelene kadar balonda durum etiketi. */
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
  /** Wall time when we last showed a tool-phase status (tool start). */
  const toolStatusShownAtRef = useRef<number | null>(null);
  const deltaQueueRef = useRef<string[]>([]);
  const deltaDrainTimerRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const deltaDrainedWaitersRef = useRef<(() => void)[]>([]);
  const streamedAssistantTextRef = useRef("");
  const receivedDeltaRef = useRef(false);

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
        const res = await callApi<{
          invoice: InvoiceDetail;
        }>("invoice-detail", {
          invoiceUuid: detailAction.invoice.invoice_uuid,
        });
        setDetailInvoice(res.invoice ?? detailAction.invoice);
      } catch {
        setDetailInvoice(detailAction.invoice);
      }
    };
    void loadDetail();
  }, [sessionLabel, detailAction]);

  const scrollToBottom = () =>
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);

  const clearChatChrome = useCallback(() => {
    setPreviewAction(null);
    setDetailAction(null);
    setDetailInvoice(null);
    setSignOtpAction(null);
    setSignOtpCode("");
    setSignOtpPhone("");
    setConfirmingDraftUuid(null);
  }, []);

  const stopDeltaDrain = useCallback(() => {
    if (deltaDrainTimerRef.current) {
      clearInterval(deltaDrainTimerRef.current);
      deltaDrainTimerRef.current = null;
    }
    deltaQueueRef.current = [];
    deltaDrainedWaitersRef.current.splice(0).forEach((resolve) => resolve());
  }, []);

  const waitUntilDeltaQueueEmpty = useCallback(async () => {
    if (deltaQueueRef.current.length === 0) return;
    await new Promise<void>((resolve) => {
      deltaDrainedWaitersRef.current.push(resolve);
    });
  }, []);

  const startDeltaDrain = useCallback((assistId: string) => {
    if (deltaDrainTimerRef.current) return;
    deltaDrainTimerRef.current = setInterval(() => {
      const queue = deltaQueueRef.current;
      if (queue.length === 0) return;
      const current = queue[0] ?? "";
      const chunk = current.slice(0, 6);
      const rest = current.slice(6);
      if (rest.length > 0) queue[0] = rest;
      else queue.shift();

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistId ? { ...m, text: (m.text ?? "") + chunk } : m,
        ),
      );
      scrollToBottom();

      if (queue.length === 0) {
        deltaDrainedWaitersRef.current
          .splice(0)
          .forEach((resolve) => resolve());
      }
    }, 28);
  }, []);

  const hydrateConversationById = useCallback(
    async (id: string) => {
      const res = await callApi<{
        messages: {
          id: string;
          role: "user" | "assistant";
          content: string;
          action_snapshot?: unknown;
        }[];
      }>("conversations", { action: "messages", conversationId: id });
      const rows = res.messages ?? [];
      setConversationId(id);
      clearChatChrome();
      setMessages(
        rows.map((m) => ({
          id: m.id,
          text: m.content,
          role: m.role,
          action:
            m.role === "assistant"
              ? parseStoredChatAction(m.action_snapshot)
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
  }, [sessionLabel, loadConversationId, loadKey, hydrateConversationById]);

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
        toolStatusShownAtRef.current = null;
        setStreamingStatus("Düşünüyor…");
        scrollToBottom();

        const assistId = newChatMessageId();
        setStreamingMessageId(assistId);
        streamedAssistantTextRef.current = "";
        receivedDeltaRef.current = false;
        deltaQueueRef.current = [];
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
                receivedDeltaRef.current = true;
                streamedAssistantTextRef.current += t;
                deltaQueueRef.current.push(t);
              },
              onTool: async (phase, name) => {
                if (phase === "start") {
                  toolStatusShownAtRef.current = Date.now();
                  setStreamingStatus(toolStatusText(name));
                  return;
                }
                const shownAt = toolStatusShownAtRef.current;
                toolStatusShownAtRef.current = null;
                if (shownAt != null) {
                  const elapsed = Date.now() - shownAt;
                  if (elapsed < MIN_TOOL_STATUS_DISPLAY_MS) {
                    await sleep(MIN_TOOL_STATUS_DISPLAY_MS - elapsed);
                  }
                }
                setStreamingStatus("Düşünüyor…");
              },
            },
          );

          setConversationId((prev) => prev ?? res.conversationId);

          if (!receivedDeltaRef.current && res.message) {
            streamedAssistantTextRef.current = res.message;
            deltaQueueRef.current.push(res.message);
          }
          await waitUntilDeltaQueueEmpty();

          const finalText =
            streamedAssistantTextRef.current.trim().length > 0
              ? streamedAssistantTextRef.current
              : res.message;

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
      refreshConversationList,
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
        const res = await callApi<{
          message: string;
          conversationId: string;
          action?: ChatMessageAction;
        }>("chat", {
          message: "confirm_pending_invoice",
          conversationId,
          action: { type: "confirm_pending_invoice", draftUuid },
        });
        const aiMsg: ChatMessage = {
          id: newChatMessageId(),
          text: res.message,
          role: "assistant",
          action: res.action,
        };
        setMessages((prev) => [...prev, aiMsg]);
        if (
          res.action?.type === "open_sign_otp" &&
          res.action.sign_otp?.draftUuid
        ) {
          setSignOtpAction(res.action);
        }
      } catch (err) {
        const errMsg: ChatMessage = {
          id: newChatMessageId(),
          text: userFacingApiError(err),
          role: "assistant",
        };
        setMessages((prev) => [...prev, errMsg]);
      } finally {
        setLoading(false);
        setConfirmingDraftUuid(null);
        scrollToBottom();
      }
    },
    [conversationId, confirmingDraftUuid],
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
      const res = await callApi<{
        message: string;
        conversationId: string;
        action?: ChatMessageAction;
      }>("chat", {
        message: "verify_sign_otp",
        conversationId,
        action: {
          type: "verify_sign_otp",
          draftUuid: signOtpAction.sign_otp.draftUuid,
          smsCode: code,
        },
      });
      const aiMsg: ChatMessage = {
        id: newChatMessageId(),
        text: res.message,
        role: "assistant",
        action: res.action,
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      const errMsg: ChatMessage = {
        id: newChatMessageId(),
        text: userFacingApiError(err),
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
        const res = await callApi<{
          message: string;
          conversationId: string;
          action?: ChatMessageAction;
        }>("chat", {
          message: "request_sign_otp",
          conversationId,
          action: {
            type: "request_sign_otp",
            draftUuid: signOtpAction.sign_otp.draftUuid,
            phone: withPhoneUpdate ? phone : undefined,
          },
        });
        const aiMsg: ChatMessage = {
          id: newChatMessageId(),
          text: res.message,
          role: "assistant",
          action: res.action,
        };
        setMessages((prev) => [...prev, aiMsg]);
        if (
          res.action?.type === "open_sign_otp" &&
          res.action.sign_otp?.draftUuid
        ) {
          setSignOtpAction(res.action);
        }
        if (withPhoneUpdate) setSignOtpPhone("");
      } catch (err) {
        const errMsg: ChatMessage = {
          id: newChatMessageId(),
          text: userFacingApiError(err),
          role: "assistant",
        };
        setMessages((prev) => [...prev, errMsg]);
      } finally {
        setRequestingSignOtp(false);
        setLoading(false);
        scrollToBottom();
      }
    },
    [conversationId, requestingSignOtp, signOtpAction, signOtpPhone],
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
    [openingConversationId, hydrateConversationById, closeMenu],
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
