import type { SupabaseClient } from "npm:@supabase/supabase-js";
import type Anthropic from "npm:@anthropic-ai/sdk";

/** Agent geçmişi — chat_context ile birlikte; Haiku bağlam penceresine göre makul üst sınır. */
export const CHAT_HISTORY_MESSAGE_LIMIT = 40;

const HIDDEN_USER_CONTENT = new Set(["[action]"]);

/** Son N mesaj — en yeni önce çekilir, kronolojik sıraya döndürülür. */
export async function loadAgentChatHistory(
  supabase: SupabaseClient,
  conversationId: string,
  limit = CHAT_HISTORY_MESSAGE_LIMIT,
): Promise<Anthropic.MessageParam[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const chronological = (data ?? []).slice().reverse();
  return normalizeMessagesForClaude(chronological);
}

/** [action] atla; ardışık aynı rol birleştir. */
export function normalizeMessagesForClaude(
  rows: Array<{ role: string; content: string }>,
): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  for (const row of rows) {
    const content = String(row.content ?? "").trim();
    if (!content || HIDDEN_USER_CONTENT.has(content)) continue;
    const role = row.role === "assistant" ? "assistant" : "user";
    const last = out[out.length - 1];
    if (last && last.role === role && typeof last.content === "string") {
      last.content = `${last.content}\n${content}`;
    } else {
      out.push({ role, content });
    }
  }
  return out;
}
