import type { ChatClientAction } from "@/types/api-responses";
import { callApi } from "@/lib/supabase";
import type { ChatMessage } from "@/types/chat-actions";
import type { ChatTurnResponse } from "@/types/api-responses";

export function newChatMessageId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

const HIDDEN_USER_ACTION_CONTENT = new Set([
  "[action]",
  "confirm_pending_invoice",
  "request_sign_otp",
  "verify_sign_otp",
]);

/** UI aksiyon istekleri — sohbet balonunda gösterilmez. */
export function isHiddenUserActionContent(content: string): boolean {
  const t = content.trim();
  if (!t) return true;
  return HIDDEN_USER_ACTION_CONTENT.has(t);
}

/** Sohbet action endpoint’ine giden ortak istek → asistan mesajı. */
export async function appendChatActionResponse(
  conversationId: string,
  action: ChatClientAction,
): Promise<ChatMessage> {
  const res = await callApi<ChatTurnResponse>("chat", {
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
