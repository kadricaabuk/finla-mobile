import { SessionBootstrapPlaceholder } from "@/components/layout/session-bootstrap-placeholder";
import SideMenu from "@/components/side-menu";
import { useConversationsList } from "@/hooks/use-conversations-list";
import { useFinlaSession } from "@/hooks/use-finla-session";
import { useLogout } from "@/hooks/use-logout";
import { releaseNativeSplash } from "@/lib/splash-handoff";
import { getUserProfile, type UserProfile } from "@/lib/supabase";
import type { PropsWithChildren } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { StyleSheet, View } from "react-native";

export type MainShellActiveScreen =
  | "chat"
  | "invoices"
  | "incoming-invoices"
  | "profile";

export interface MainShellSideMenuBindings {
  onNewChat: () => void;
  onOpenConversation?: (id: string) => void | Promise<void>;
  openingConversationId?: string | null;
  activeConversationId?: string | null;
  activeScreen?: MainShellActiveScreen;
}

interface MainAppShellContextValue {
  sessionLabel: string;
  userProfile: UserProfile | null;
  refreshUserProfile: () => Promise<void>;
  openMenu: () => void;
  closeMenu: () => void;
  registerSideMenu: (
    owner: string,
    bindings: MainShellSideMenuBindings,
  ) => void;
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
  const { logout: performLogout, loading: logoutLoading } = useLogout();

  // Native splash garantisi: bootstrap hızlı biterse placeholder onLayout
  // tetiklenmeden unmount olabiliyor ve splash'i kapatan kalmıyordu (oturumlu
  // soğuk açılışta ekran splash'te takılıyordu). Release idempotent; login /
  // onboarding'e yönlendirilen akışlarda da güvenle tekrar çağrılabilir.
  useEffect(() => {
    if (!bootstrapped) return;
    void releaseNativeSplash();
  }, [bootstrapped]);

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuRegistration, setMenuRegistration] =
    useState<ShellMenuRegistration | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  const refreshUserProfile = useCallback(async () => {
    try {
      const res = await getUserProfile();
      setUserProfile(res.profile);
    } catch {
      setUserProfile(null);
    }
  }, []);

  useEffect(() => {
    if (!bootstrapped || !sessionLabel) {
      setUserProfile(null);
      return;
    }
    void refreshUserProfile();
  }, [bootstrapped, refreshUserProfile, sessionLabel]);

  const registerSideMenu = useCallback(
    (owner: string, bindings: MainShellSideMenuBindings) => {
      setMenuRegistration({ owner, bindings });
    },
    [],
  );

  const unregisterSideMenu = useCallback((owner: string) => {
    setMenuRegistration((prev) => (prev?.owner === owner ? null : prev));
  }, []);

  const openMenu = useCallback(() => setMenuOpen(true), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const refreshList = useCallback(
    (mode: "indicator" | "pull" | "none" = "indicator") =>
      refreshConversationList(mode),
    [refreshConversationList],
  );

  const onPullRefreshConversations = useCallback(
    () =>
      Promise.all([refreshConversationList("pull"), refreshUserProfile()]).then(
        () => undefined,
      ),
    [refreshUserProfile, refreshConversationList],
  );

  const ctx = useMemo<MainAppShellContextValue>(
    () => ({
      sessionLabel: sessionLabel!,
      userProfile,
      refreshUserProfile,
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
      refreshUserProfile,
      registerSideMenu,
      sessionLabel,
      unregisterSideMenu,
      userProfile,
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
      <View style={styles.flex}>{children}</View>
      <SideMenu
        logoutLoading={logoutLoading}
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
        userProfile={userProfile}
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
