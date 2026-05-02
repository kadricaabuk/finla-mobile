import { useMainAppShell } from "@/contexts/main-app-shell-context";
import { useScrollToEndOnKeyboard } from "@/hooks/use-scroll-to-end-on-keyboard";
import { getTokens } from "@/lib/session";
import { callApi, userFacingApiError } from "@/lib/supabase";
import type {
  ChatMessage,
  ChatMessageAction,
  InvoiceDetail,
} from "@/types/chat-actions";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, type ScrollView } from "react-native";

export function useChatScreen() {
  const {
    sessionLabel,
    refreshConversationList,
    closeMenu,
  } = useMainAppShell();
  const routeParams = useLocalSearchParams<{
    loadConversationId?: string;
    loadKey?: string;
    resetKey?: string;
  }>();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [detailAction, setDetailAction] = useState<ChatMessageAction | null>(
    null,
  );
  const [detailInvoice, setDetailInvoice] = useState<InvoiceDetail | null>(
    null,
  );
  const [previewAction, setPreviewAction] =
    useState<ChatMessageAction | null>(null);
  const [confirmingDraftUuid, setConfirmingDraftUuid] = useState<string | null>(
    null,
  );
  const [signOtpAction, setSignOtpAction] =
    useState<ChatMessageAction | null>(null);
  const [signOtpCode, setSignOtpCode] = useState("");
  const [signOtpPhone, setSignOtpPhone] = useState("");
  const [verifyingSignOtp, setVerifyingSignOtp] = useState(false);
  const [requestingSignOtp, setRequestingSignOtp] = useState(false);
  const [openingConversationId, setOpeningConversationId] = useState<
    string | null
  >(null);
  const scrollRef = useRef<ScrollView>(null);

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

  const hydrateConversationById = useCallback(
    async (id: string) => {
      const res = await callApi<{
        messages: { id: string; role: "user" | "assistant"; content: string }[];
      }>("conversations", { action: "messages", conversationId: id });
      const rows = res.messages ?? [];
      setConversationId(id);
      clearChatChrome();
      setMessages(
        rows.map((m) => ({
          id: m.id,
          text: m.content,
          role: m.role,
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
    typeof routeParams.loadKey === "string"
      ? routeParams.loadKey
      : undefined;
  const resetKey =
    typeof routeParams.resetKey === "string"
      ? routeParams.resetKey
      : undefined;

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
      const tokens = await getTokens();
      if (!tokens) return;

      const userMsg: ChatMessage = {
        id: Date.now().toString(),
        text,
        role: "user",
      };
      setMessages((prev) => [...prev, userMsg]);
      setLoading(true);
      scrollToBottom();

      try {
        const res = await callApi<{
          message: string;
          conversationId: string;
          action?: ChatMessageAction;
        }>("chat", {
          message: text,
          conversationId,
        });

        const isNewThread = conversationId === null;
        if (!conversationId) setConversationId(res.conversationId);

        const aiMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
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
        if (isNewThread && res.conversationId)
          void refreshConversationList("none");
      } catch (err) {
        const errMsg: ChatMessage = {
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
    [conversationId, refreshConversationList],
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
          id: (Date.now() + 1).toString(),
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
        id: (Date.now() + 1).toString(),
        text: res.message,
        role: "assistant",
        action: res.action,
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      const errMsg: ChatMessage = {
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
          id: (Date.now() + 1).toString(),
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
