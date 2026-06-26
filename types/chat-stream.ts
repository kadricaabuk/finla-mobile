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

export type ChatStreamEventToolLog = {
  type: "tool_log";
  ts: string;
  phase: "start" | "success" | "error";
  tool: string;
  conversation_id: string;
  gib_username: string;
  source?: "agent" | "fast_path";
  tool_use_id?: string;
  agent_round?: number;
  input?: unknown;
  output?: unknown;
  user_message_preview?: string;
  duration_ms?: number;
  error_message?: string;
  error_code?: string;
  error_classified_message?: string;
  gib_payload_debug?: unknown;
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
  | ChatStreamEventToolLog
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
    case "tool_log":
      return typeof o.ts === "string" &&
          (o.phase === "start" || o.phase === "success" || o.phase === "error") &&
          typeof o.tool === "string" &&
          typeof o.conversation_id === "string" &&
          typeof o.gib_username === "string"
        ? {
          type: "tool_log",
          ts: o.ts,
          phase: o.phase,
          tool: o.tool,
          conversation_id: o.conversation_id,
          gib_username: o.gib_username,
          source: o.source === "agent" || o.source === "fast_path"
            ? o.source
            : undefined,
          tool_use_id: typeof o.tool_use_id === "string"
            ? o.tool_use_id
            : undefined,
          agent_round: typeof o.agent_round === "number" ? o.agent_round : undefined,
          input: o.input,
          output: o.output,
          user_message_preview: typeof o.user_message_preview === "string"
            ? o.user_message_preview
            : undefined,
          duration_ms: typeof o.duration_ms === "number" ? o.duration_ms : undefined,
          error_message: typeof o.error_message === "string"
            ? o.error_message
            : undefined,
          error_code: typeof o.error_code === "string" ? o.error_code : undefined,
          error_classified_message: typeof o.error_classified_message === "string"
            ? o.error_classified_message
            : undefined,
          gib_payload_debug: o.gib_payload_debug,
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
