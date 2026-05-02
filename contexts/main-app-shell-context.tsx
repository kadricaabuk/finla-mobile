import { SessionBootstrapPlaceholder } from "@/components/layout/session-bootstrap-placeholder";
import SideMenu from "@/components/side-menu";
import { useConversationsList } from "@/hooks/use-conversations-list";
import { useFinlaSession } from "@/hooks/use-finla-session";
import { useLogout } from "@/hooks/use-logout";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { PropsWithChildren } from "react";
import { StyleSheet, View } from "react-native";

export interface MainShellSideMenuBindings {
  onNewChat: () => void;
  onOpenConversation?: (id: string) => void | Promise<void>;
  openingConversationId?: string | null;
  activeConversationId?: string | null;
  activeScreen?: "chat" | "invoices";
}

interface MainAppShellContextValue {
  sessionLabel: string;
  openMenu: () => void;
  closeMenu: () => void;
  registerSideMenu: (owner: string, bindings: MainShellSideMenuBindings) => void;
  unregisterSideMenu: (owner: string) => void;
  refreshConversationList: (
    mode?: "indicator" | "pull" | "none",
  ) => Promise<void>;
}

type ShellMenuRegistration = {
  owner: string;
  bindings: MainShellSideMenuBindings;
};

const MainAppShellContext = createContext<MainAppShellContextValue | null>(
  null,
);

export function MainAppShellProvider({ children }: PropsWithChildren) {
  const { sessionLabel, bootstrapped } = useFinlaSession();
  const {
    conversations,
    conversationsLoading,
    conversationsRefreshing,
    refreshConversationList,
  } = useConversationsList(sessionLabel);
  const performLogout = useLogout();

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuRegistration, setMenuRegistration] =
    useState<ShellMenuRegistration | null>(null);

  const registerSideMenu = useCallback(
    (owner: string, bindings: MainShellSideMenuBindings) => {
      setMenuRegistration({ owner, bindings });
    },
    [],
  );

  const unregisterSideMenu = useCallback((owner: string) => {
    setMenuRegistration((prev) =>
      prev?.owner === owner ? null : prev,
    );
  }, []);

  const openMenu = useCallback(() => setMenuOpen(true), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const refreshList = useCallback(
    (mode: "indicator" | "pull" | "none" = "indicator") =>
      refreshConversationList(mode),
    [refreshConversationList],
  );

  const onPullRefreshConversations = useCallback(
    () => refreshConversationList("pull"),
    [refreshConversationList],
  );

  const ctx = useMemo<MainAppShellContextValue>(
    () => ({
      sessionLabel: sessionLabel!,
      openMenu,
      closeMenu,
      registerSideMenu,
      unregisterSideMenu,
      refreshConversationList: refreshList,
    }),
    [
      closeMenu,
      openMenu,
      refreshList,
      registerSideMenu,
      sessionLabel,
      unregisterSideMenu,
    ],
  );

  const bindings = menuRegistration?.bindings ?? {
    onNewChat: () => {},
    openingConversationId: null as string | null,
    activeConversationId: null as string | null,
  };

  if (!bootstrapped) {
    return <SessionBootstrapPlaceholder />;
  }
  if (!sessionLabel) {
    return null;
  }

  return (
    <MainAppShellContext.Provider value={ctx}>
      <View style={styles.flex}>
        {children}
      </View>
      <SideMenu
        isOpen={menuOpen}
        onClose={closeMenu}
        username={sessionLabel}
        conversations={conversations}
        conversationsLoading={conversationsLoading}
        conversationsRefreshing={conversationsRefreshing}
        onRefreshConversations={onPullRefreshConversations}
        onLogout={performLogout}
        onNewChat={bindings.onNewChat}
        onOpenConversation={bindings.onOpenConversation}
        openingConversationId={bindings.openingConversationId}
        activeConversationId={bindings.activeConversationId}
        activeScreen={bindings.activeScreen}
      />
    </MainAppShellContext.Provider>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
});

export function useMainAppShell(): MainAppShellContextValue {
  const v = useContext(MainAppShellContext);
  if (!v)
    throw new Error("useMainAppShell must be used within MainAppShellProvider");
  return v;
}
