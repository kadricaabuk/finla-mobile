import type { ChatMessageAction } from "@/types/chat-actions";

/** Line types from POST /chat when streaming (aligned with Edge NDJSON events). */

export type ChatStreamEventMeta = {
  type: "meta";
  conversationId: string;
};

export type ChatStreamEventDelta = { type: "delta"; text: string };

export type ChatStreamEventTool = {
  type: "tool";
  phase: "start" | "end";
  name: string;
};

export type ChatStreamEventDone = {
  type: "done";
  message: string;
  conversationId: string;
  action: ChatMessageAction | null;
};

export type ChatStreamEventError = {
  type: "error";
  message: string;
};

export type ChatStreamLine =
  | ChatStreamEventMeta
  | ChatStreamEventDelta
  | ChatStreamEventTool
  | ChatStreamEventDone
  | ChatStreamEventError;

export function asChatStreamLine(raw: unknown): ChatStreamLine | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.type !== "string") return null;
  switch (o.type) {
    case "meta":
      return typeof o.conversationId === "string"
        ? { type: "meta", conversationId: o.conversationId }
        : null;
    case "delta":
      return typeof o.text === "string"
        ? { type: "delta", text: o.text }
        : null;
    case "tool":
      return o.phase === "start" || o.phase === "end"
        ? {
          type: "tool",
          phase: o.phase,
          name: typeof o.name === "string" ? o.name : "?",
        }
        : null;
    case "error":
      return typeof o.message === "string"
        ? { type: "error", message: o.message }
        : null;
    case "done":
      return typeof o.message === "string" && typeof o.conversationId === "string"
        ? {
          type: "done",
          message: o.message,
          conversationId: o.conversationId,
          action: (o.action as ChatMessageAction | null | undefined) ?? null,
        }
        : null;
    default:
      return null;
  }
}
