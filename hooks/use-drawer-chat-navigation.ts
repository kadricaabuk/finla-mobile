import { router } from "expo-router";
import { useCallback } from "react";
import { useMainAppShell } from "@/contexts/main-app-shell-context";

/** Yan menüden sohbet ekranına geçiş (faturalar / profil ekranlarında ortak). */
export function useDrawerChatNavigation() {
  const { closeMenu } = useMainAppShell();

  const handleDrawerNewChat = useCallback(() => {
    closeMenu();
    router.replace({
      pathname: "/",
      params: { resetKey: String(Date.now()) },
    });
  }, [closeMenu]);

  const handleDrawerOpenConversation = useCallback(
    (id: string) => {
      closeMenu();
      router.replace({
        pathname: "/",
        params: {
          loadConversationId: id,
          loadKey: String(Date.now()),
        },
      });
    },
    [closeMenu],
  );

  return { handleDrawerNewChat, handleDrawerOpenConversation };
}
