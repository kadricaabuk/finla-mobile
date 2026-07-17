import type { SupabaseClient } from "npm:@supabase/supabase-js";
import { CHAT_VERSION } from "./version.ts";

/** Tüm chat mesajı insert'leri buradan geçer; deploy sürümünü damgalar. */
export function insertChatMessage(
  supabase: SupabaseClient,
  row: Record<string, unknown>,
) {
  return supabase
    .from("messages")
    .insert({ ...row, app_version: CHAT_VERSION });
}

// Mirrors HIDDEN_USER_ACTION_CONTENT in components/chat/chat-action-response.ts —
// user rows that are UI action requests, never shown as bubbles.
const HIDDEN_USER_ACTION_CONTENT = new Set([
  "[action]",
  "confirm_pending_invoice",
]);

/**
 * Deletes the last visible user message and everything after it. The edit
 * flow sends `replaceLastExchange: true` so the old exchange is truncated in
 * the same request that carries the edited message.
 */
export async function deleteLastExchange(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("messages")
    .select("id,role,content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const rows = data ?? [];
  let startIndex = -1;
  for (let i = rows.length - 1; i >= 0; i--) {
    const content = String(rows[i].content ?? "").trim();
    if (
      rows[i].role === "user" &&
      content &&
      !HIDDEN_USER_ACTION_CONTENT.has(content)
    ) {
      startIndex = i;
      break;
    }
  }
  if (startIndex === -1) return 0;

  const ids = rows.slice(startIndex).map((r) => r.id);
  const { error: delErr } = await supabase
    .from("messages")
    .delete()
    .in("id", ids);
  if (delErr) throw delErr;
  return ids.length;
}
