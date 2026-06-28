import { callApi } from "@/lib/supabase";
import type { ChatMessage, ChatMessageAction } from "@/types/chat-actions";
import type { ChatTurnResponse } from "@/types/api-responses";

export function newChatMessageId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/** Sohbet action endpoint’ine giden ortak istek → asistan mesajı. */
export async function appendChatActionResponse(
  conversationId: string,
  message: string,
  action: ChatMessageAction,
): Promise<ChatMessage> {
  const res = await callApi<ChatTurnResponse>("chat", {
    message,
    conversationId,
    action,
  });
  return {
    id: newChatMessageId(),
    text: res.message,
    role: "assistant",
    action: res.action,
  };
}
