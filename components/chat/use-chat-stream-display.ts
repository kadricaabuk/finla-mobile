import { useCallback, useRef } from "react";
import type { ScrollView } from "react-native";
import type { ChatMessage } from "@/types/chat-actions";

/** So very fast GİB round-trips still show the tool line long enough to read. */
export const MIN_TOOL_STATUS_DISPLAY_MS = 1500;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function toolStatusText(rawName: string): string {
  const first = rawName.split(",")[0]?.trim();
  const toolName = first && first.length > 0 ? first : rawName.trim();
  switch (toolName) {
    case "list_invoices":
      return "Faturalar araştırılıyor…";
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
    case "confirm_invoice_issue":
      return "Fatura GİB'e gönderiliyor…";
      return "Fatura kesiliyor…";
    case "export_invoices_excel":
      return "Excel dosyası oluşturuluyor…";
    default:
      return "İşleniyor…";
  }
}

export function useChatStreamDisplay(
  scrollRef: React.RefObject<ScrollView | null>,
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
) {
  const deltaQueueRef = useRef<string[]>([]);
  const deltaDrainTimerRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const deltaDrainedWaitersRef = useRef<(() => void)[]>([]);
  const streamedAssistantTextRef = useRef("");
  const receivedDeltaRef = useRef(false);
  const toolStatusShownAtRef = useRef<number | null>(null);

  const scrollToBottom = useCallback(
    () =>
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80),
    [scrollRef],
  );

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

  const startDeltaDrain = useCallback(
    (assistId: string) => {
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
    },
    [scrollToBottom, setMessages],
  );

  const resetStreamBuffers = useCallback(() => {
    streamedAssistantTextRef.current = "";
    receivedDeltaRef.current = false;
    deltaQueueRef.current = [];
    toolStatusShownAtRef.current = null;
  }, []);

  const pushDelta = useCallback((text: string) => {
    receivedDeltaRef.current = true;
    streamedAssistantTextRef.current += text;
    deltaQueueRef.current.push(text);
  }, []);

  const onToolPhase = useCallback(
    async (phase: "start" | "end", name: string) => {
      if (phase === "start") {
        toolStatusShownAtRef.current = Date.now();
        return toolStatusText(name);
      }
      const shownAt = toolStatusShownAtRef.current;
      toolStatusShownAtRef.current = null;
      if (shownAt != null) {
        const elapsed = Date.now() - shownAt;
        if (elapsed < MIN_TOOL_STATUS_DISPLAY_MS) {
          await sleep(MIN_TOOL_STATUS_DISPLAY_MS - elapsed);
        }
      }
      return "Düşünüyor…";
    },
    [],
  );

  const finalizeStreamedText = useCallback((fallbackMessage: string) => {
    if (!receivedDeltaRef.current && fallbackMessage) {
      streamedAssistantTextRef.current = fallbackMessage;
      deltaQueueRef.current.push(fallbackMessage);
    }
    return streamedAssistantTextRef.current.trim().length > 0
      ? streamedAssistantTextRef.current
      : fallbackMessage;
  }, []);

  return {
    scrollToBottom,
    stopDeltaDrain,
    waitUntilDeltaQueueEmpty,
    startDeltaDrain,
    resetStreamBuffers,
    pushDelta,
    onToolPhase,
    finalizeStreamedText,
  };
}
