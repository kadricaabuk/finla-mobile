/** NDJSON chat stream — server-side line types and negotiation. */

export const NDJSON_CONTENT_TYPE = "application/x-ndjson";

export type NdjsonChatEvent =
  | { type: "meta"; conversationId: string }
  | { type: "delta"; text: string }
  | { type: "tool"; phase: "start" | "end"; name: string }
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
