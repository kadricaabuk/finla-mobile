import { type ConversationSummary } from "@/components/side-menu";
import { callApi } from "@/lib/supabase";
import { useCallback, useEffect, useState } from "react";

export function useConversationsList(sessionLabel: string | null) {
  const [conversations, setConversations] = useState<ConversationSummary[]>(
    [],
  );
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [conversationsRefreshing, setConversationsRefreshing] =
    useState(false);

  const refreshConversationList = useCallback(
    async (mode: "indicator" | "pull" | "none" = "indicator") => {
      if (!sessionLabel) return;
      if (mode === "indicator") setConversationsLoading(true);
      if (mode === "pull") setConversationsRefreshing(true);
      try {
        const res = await callApi<{ conversations: ConversationSummary[] }>(
          "conversations",
          { action: "list" },
        );
        setConversations(res.conversations ?? []);
      } catch {
        setConversations([]);
      } finally {
        if (mode === "indicator") setConversationsLoading(false);
        if (mode === "pull") setConversationsRefreshing(false);
      }
    },
    [sessionLabel],
  );

  useEffect(() => {
    if (sessionLabel) void refreshConversationList("indicator");
  }, [sessionLabel, refreshConversationList]);

  return {
    conversations,
    conversationsLoading,
    conversationsRefreshing,
    refreshConversationList,
  };
}
