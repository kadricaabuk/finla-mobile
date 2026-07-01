import type { ConversationSummary } from "@/types/conversations";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Keyboard,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const MENU_WIDTH = 280;

export type { ConversationSummary } from "@/types/conversations";

interface SideMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onNewChat: () => void;
  onLogout: () => void;
  onOpenConversation?: (id: string) => void | Promise<void>;
  username: string;
  conversations?: ConversationSummary[];
  conversationsLoading?: boolean;
  conversationsRefreshing?: boolean;
  onRefreshConversations?: () => void | Promise<void>;
  openingConversationId?: string | null;
  activeConversationId?: string | null;
  logoutLoading?: boolean;
  /** Giden / gelen fatura ekranındayken liste satırı yalnızca menüyü kapatır. */
  activeScreen?: "chat" | "invoices" | "incoming-invoices" | "profile";
  userProfile?: {
    taxIDOrTRID?: string;
    title?: string;
    name?: string;
    surname?: string;
  } | null;
}

function formatConvDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("tr-TR", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

export default function SideMenu({
  isOpen,
  onClose,
  onNewChat,
  onLogout,
  onOpenConversation,
  username,
  logoutLoading,
  conversations = [],
  conversationsLoading = false,
  conversationsRefreshing = false,
  onRefreshConversations,
  openingConversationId = null,
  activeConversationId = null,
  activeScreen = "chat",
  userProfile = null,
}: SideMenuProps) {
  const translateX = useRef(new Animated.Value(-MENU_WIDTH)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();

  useEffect(() => {
    isOpen && Keyboard.dismiss();
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      Animated.parallel([
        Animated.spring(translateX, {
          toValue: 0,
          tension: 80,
          friction: 15,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0.45,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: -MENU_WIDTH,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isOpen, translateX, backdropOpacity]);

  const profileDisplayName =
    userProfile?.title?.trim() ||
    [userProfile?.name, userProfile?.surname]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    username;
  const profileSubLabel = userProfile?.taxIDOrTRID
    ? `VKN/TCKN: ${userProfile.taxIDOrTRID}`
    : "GİB Hesabı";

  return (
    <View
      style={StyleSheet.absoluteFillObject}
      pointerEvents={isOpen ? "auto" : "none"}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View
          style={[styles.backdrop, { opacity: backdropOpacity }]}
        />
      </TouchableWithoutFeedback>

      <Animated.View
        style={[
          styles.panel,
          { transform: [{ translateX }], paddingTop: insets.top },
        ]}
      >
        <View style={styles.panelHeader}>
          <Text style={styles.logo}>finla</Text>
        </View>

        <ScrollView
          style={styles.menuScroll}
          contentContainerStyle={[
            styles.menuScrollInner,
            { paddingBottom: insets.bottom + 172 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={
            onRefreshConversations ? (
              <RefreshControl
                refreshing={conversationsRefreshing}
                onRefresh={() => void Promise.resolve(onRefreshConversations())}
                tintColor="#000"
                colors={["#000"]}
              />
            ) : undefined
          }
        >
          <TouchableOpacity
            testID="side-menu-new-chat"
            style={[
              styles.newChatBtn,
              activeScreen === "chat" &&
                !activeConversationId &&
                styles.navBtnCurrent,
            ]}
            onPress={onNewChat}
            activeOpacity={0.7}
          >
            <View style={styles.newChatLeft}>
              <Ionicons name="create-outline" size={18} color="#000" />
              <Text style={styles.newChatLabel}>Yeni Sohbet</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            testID="side-menu-outgoing-invoices"
            style={[
              styles.navBtn,
              activeScreen === "invoices" && styles.navBtnCurrent,
            ]}
            onPress={() => {
              if (activeScreen === "invoices") {
                onClose();
                return;
              }
              onClose();
              router.push("/outgoing-invoices");
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-up-circle-outline" size={18} color="#000" />
            <Text style={styles.navBtnLabel}>Giden Faturalar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID="side-menu-incoming-invoices"
            style={[
              styles.navBtn,
              activeScreen === "incoming-invoices" && styles.navBtnCurrent,
            ]}
            onPress={() => {
              if (activeScreen === "incoming-invoices") {
                onClose();
                return;
              }
              onClose();
              router.push("/incoming-invoices");
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-down-circle-outline" size={18} color="#000" />
            <Text style={styles.navBtnLabel}>Gelen Faturalar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID="side-menu-profile"
            style={[
              styles.navBtn,
              activeScreen === "profile" && styles.navBtnCurrent,
            ]}
            onPress={() => {
              if (activeScreen === "profile") {
                onClose();
                return;
              }
              onClose();
              router.push("/profile");
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="person-outline" size={18} color="#000" />
            <Text style={styles.navBtnLabel}>Profil</Text>
          </TouchableOpacity>

          {onOpenConversation ? (
            <View style={styles.convSection}>
              <Text style={styles.sectionLabel}>Sohbetler</Text>
              {conversationsLoading ? (
                <View style={styles.convLoading}>
                  <ActivityIndicator size="small" color="#888" />
                  <Text style={styles.convLoadingText}>Yükleniyor…</Text>
                </View>
              ) : conversations.length === 0 ? (
                <Text style={styles.convEmpty}>Kayıtlı sohbet yok</Text>
              ) : (
                conversations.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={[
                      styles.convRow,
                      activeConversationId === c.id && styles.convRowActive,
                    ]}
                    activeOpacity={0.65}
                    disabled={!!openingConversationId}
                    onPress={() =>
                      void Promise.resolve(onOpenConversation(c.id))
                    }
                  >
                    <Ionicons
                      name="chatbox-ellipses-outline"
                      size={17}
                      color="#555"
                    />
                    <View style={styles.convRowTextWrap}>
                      <Text style={styles.convTitle} numberOfLines={1}>
                        {c.title.trim() ? c.title : "Sohbet"}
                      </Text>
                      <Text style={styles.convMeta} numberOfLines={1}>
                        {formatConvDate(c.created_at)}
                      </Text>
                    </View>
                    {openingConversationId === c.id ? (
                      <ActivityIndicator size="small" color="#000" />
                    ) : (
                      <Ionicons name="chevron-forward" size={15} color="#CCC" />
                    )}
                  </TouchableOpacity>
                ))
              )}
            </View>
          ) : null}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.profileRow}>
            <TouchableOpacity
              style={styles.profileRowMain}
              activeOpacity={0.7}
              onPress={() => {
                if (activeScreen === "profile") {
                  onClose();
                  return;
                }
                onClose();
                router.push("/profile");
              }}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarInitial}>
                  {profileDisplayName.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.profileInfo}>
                <Text style={styles.profileName} numberOfLines={1}>
                  {profileDisplayName}
                </Text>
                <Text style={styles.profileSub} numberOfLines={1}>
                  {profileSubLabel}
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              testID="side-menu-logout"
              accessibilityLabel="Çıkış"
              style={styles.logoutBtn}
              onPress={onLogout}
            >
              {logoutLoading ? (
                <ActivityIndicator size="small" color="#888" />
              ) : (
                <Ionicons name="log-out-outline" size={20} color="#888" />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
  },
  panel: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: MENU_WIDTH,
    flexDirection: "column",
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 20,
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  logo: {
    fontSize: 20,
    fontWeight: "600",
    letterSpacing: -0.5,
    color: "#000",
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  newChatBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 10,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 10,
  },
  navBtn: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 10,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 10,
    gap: 8,
  },
  navBtnCurrent: {
    backgroundColor: "#F2F2F2",
    borderWidth: 1,
    borderColor: "#E5E5E5",
    opacity: 0.92,
  },
  navBtnLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    color: "#000",
  },
  navChevron: {
    marginLeft: "auto",
  },
  newChatLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  newChatLabel: {
    fontSize: 15,
    fontWeight: "500",
    color: "#000",
  },
  menuScroll: {
    flex: 1,
  },
  menuScrollInner: {
    paddingTop: 4,
  },
  convSection: {
    marginTop: 8,
    paddingHorizontal: 10,
  },
  convLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 6,
    paddingVertical: 12,
  },
  convLoadingText: {
    fontSize: 13,
    color: "#888",
  },
  convEmpty: {
    fontSize: 13,
    color: "#ABABAB",
    paddingHorizontal: 6,
    paddingVertical: 10,
    fontStyle: "italic",
  },
  convRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#FAFAFA",
  },
  convRowActive: {
    backgroundColor: "#EEEEEE",
    borderWidth: 1,
    borderColor: "#D0D0D0",
  },
  convRowTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  convTitle: {
    fontSize: 14,
    fontWeight: "500",
    color: "#111",
  },
  convMeta: {
    fontSize: 11,
    color: "#AAA",
    marginTop: 2,
  },
  list: {
    flex: 1,
    paddingHorizontal: 10,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#ABABAB",
    letterSpacing: 0.4,
    paddingHorizontal: 8,
    paddingTop: 12,
    paddingBottom: 8,
    textTransform: "uppercase",
  },
  infoCard: {
    backgroundColor: "#F8F8F8",
    borderRadius: 10,
    padding: 12,
    marginHorizontal: 2,
  },
  infoText: {
    fontSize: 13,
    color: "#555",
    lineHeight: 19,
  },
  footer: {
    backgroundColor: "#fff",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E8E8E8",
    paddingHorizontal: 16,
    paddingTop: 12,
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    elevation: 24,
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  profileRowMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#000",
  },
  profileSub: {
    fontSize: 11,
    color: "#ABABAB",
    marginTop: 1,
  },
  logoutBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
});
