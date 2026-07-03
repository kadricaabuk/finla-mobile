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
