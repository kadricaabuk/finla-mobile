/** NDJSON chat stream — server-side line types and negotiation. */

export const NDJSON_CONTENT_TYPE = "application/x-ndjson";

export type NdjsonToolLogPhase = "start" | "success" | "error";

/** Sanitized tool call log — yalnızca FINLA_STREAM_TOOL_LOGS=true iken client'a gider. */
export type NdjsonToolLogEvent = {
  type: "tool_log";
  ts: string;
  phase: NdjsonToolLogPhase;
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

export type NdjsonChatEvent =
  | { type: "meta"; conversationId: string }
  | { type: "delta"; text: string }
  | { type: "tool"; phase: "start" | "end"; name: string }
  | NdjsonToolLogEvent
  | {
    type: "done";
    message: string;
    conversationId: string;
    /** Full API action (preview includes HTML); not persisted in NDJSON mid-stream lines. */
    action: unknown;
  }
  | { type: "error"; message: string };

const encoder = new TextEncoder();

export function encodeNdjsonEvent(ev: NdjsonChatEvent): Uint8Array {
  return encoder.encode(`${JSON.stringify(ev)}\n`);
}

/** Body.stream === true and Accept mentions application/x-ndjson */
export function clientWantsNdjsonStream(
  req: Request,
  body: { stream?: boolean },
): boolean {
  const accept = (req.headers.get("accept") ?? "").toLowerCase();
  const wantsAccept = accept.includes("application/x-ndjson");
  return body.stream === true && wantsAccept;
}
