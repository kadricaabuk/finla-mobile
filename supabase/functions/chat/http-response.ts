import { corsHeaders } from "../_shared/cors.ts";
import type { ChatAction } from "./types.ts";

export function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status, headers: corsHeaders });
}

export function jsonChatOk(
  message: string,
  conversationId: string,
  action: ChatAction | null = null,
): Response {
  return Response.json(
    { message, conversationId, action },
    { headers: corsHeaders },
  );
}
