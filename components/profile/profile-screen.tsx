import { IconHeaderButton } from "@/components/layout/icon-header-button";
import { useProfileScreen } from "@/components/profile/use-profile-screen";
import { useMainAppShell } from "@/contexts/main-app-shell-context";
import { useRegisterMainShellSideMenu } from "@/hooks/use-register-main-shell-side-menu";
import type { UserProfile } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import { useMemo, type ReactNode } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const PROFILE_SHELL_OWNER_ID = "screen-profile";

function displayName(p: UserProfile): string {
  const t = p.title?.trim();
  if (t) return t;
  const n = [p.name, p.surname]
    .filter(Boolean)
    .join(" ")
    .trim();
  return n || "Profil";
}

function ProfileRow({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v) return null;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

/** İletişim satırları — boş alanlarda da satır gösterir (—). */
function ContactDisplayRow({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  const v = typeof value === "string" ? value.trim() : "";
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{v || "—"}</Text>
    </View>
  );
}

function ProfileEditRow({
  label,
  value,
  onChangeText,
  keyboardType = "default",
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  keyboardType?: "default" | "email-address" | "phone-pad";
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor="#BBB"
        keyboardType={keyboardType}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

export default function ProfileScreen() {
  const { openMenu } = useMainAppShell();
  const {
    profile,
    loading,
    refreshing,
    error,
    refreshProfile,
    handleDrawerNewChat,
    handleDrawerOpenConversation,
    editingContact,
    contactDraft,
    saving,
    saveError,
    beginEditContact,
    cancelEditContact,
    saveContact,
    updateContactField,
  } = useProfileScreen();

  const sideMenuBindings = useMemo(
    () => ({
      activeScreen: "profile" as const,
      openingConversationId: null,
      activeConversationId: null,
      onNewChat: handleDrawerNewChat,
      onOpenConversation: handleDrawerOpenConversation,
    }),
    [handleDrawerNewChat, handleDrawerOpenConversation],
  );

  useRegisterMainShellSideMenu(PROFILE_SHELL_OWNER_ID, sideMenuBindings);

  const showAddressSection =
    !!profile &&
    !!(
      profile.fullAddress?.trim() ||
      profile.buildingName ||
      profile.buildingNumber ||
      profile.doorNumber ||
      profile.district ||
      profile.town ||
      profile.city ||
      profile.zipCode ||
      profile.country
    );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <IconHeaderButton
          name="menu"
          onPress={openMenu}
          accessibilityLabel="Menü"
        />
        <Text style={styles.title} numberOfLines={1}>
          Profil
        </Text>
        <View style={styles.headerRight} />
      </View>

      {loading && !profile ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#000" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={40} color="#EF4444" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => refreshProfile()}
          >
            <Text style={styles.retryText}>Tekrar Dene</Text>
          </TouchableOpacity>
        </View>
      ) : profile ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollInner}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => refreshProfile()}
              tintColor="#000"
              enabled={!editingContact}
            />
          }
        >
          <View style={styles.hero}>
            <View style={styles.avatarLarge}>
              <Text style={styles.avatarLargeText}>
                {displayName(profile).charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text style={styles.heroName}>{displayName(profile)}</Text>
            {profile.taxIDOrTRID?.trim() ? (
              <Text style={styles.heroSub}>
                VKN/TCKN: {profile.taxIDOrTRID.trim()}
              </Text>
            ) : null}
          </View>

          <Section title="Kimlik">
            <ProfileRow label="Ünvan" value={profile.title} />
            <ProfileRow label="Ad" value={profile.name} />
            <ProfileRow label="Soyad" value={profile.surname} />
            <ProfileRow label="VKN / TCKN" value={profile.taxIDOrTRID} />
            <ProfileRow label="Sicil no" value={profile.registryNo} />
            <ProfileRow label="MERSİS no" value={profile.mersisNo} />
            <ProfileRow label="Vergi dairesi" value={profile.taxOffice} />
            <ProfileRow label="İş merkezi" value={profile.businessCenter} />
          </Section>

          <Section title="İletişim">
            {editingContact && contactDraft ? (
              <>
                <ProfileEditRow
                  label="Telefon"
                  value={contactDraft.phoneNumber}
                  onChangeText={(t) => updateContactField("phoneNumber", t)}
                  keyboardType="phone-pad"
                />
                <ProfileEditRow
                  label="Faks"
                  value={contactDraft.faxNumber}
                  onChangeText={(t) => updateContactField("faxNumber", t)}
                  keyboardType="phone-pad"
                />
                <ProfileEditRow
                  label="E-posta"
                  value={contactDraft.email}
                  onChangeText={(t) => updateContactField("email", t)}
                  keyboardType="email-address"
                />
                <ProfileEditRow
                  label="Web sitesi"
                  value={contactDraft.webSite}
                  onChangeText={(t) => updateContactField("webSite", t)}
                />
              </>
            ) : (
              <>
                <ContactDisplayRow
                  label="Telefon"
                  value={profile.phoneNumber}
                />
                <ContactDisplayRow label="Faks" value={profile.faxNumber} />
                <ContactDisplayRow label="E-posta" value={profile.email} />
                <ContactDisplayRow
                  label="Web sitesi"
                  value={profile.webSite}
                />
              </>
            )}
          </Section>

          {showAddressSection ? (
            <Section title="Adres">
              {profile.fullAddress?.trim() ? (
                <ProfileRow label="Adres" value={profile.fullAddress} />
              ) : null}
              {[
                profile.buildingName,
                profile.buildingNumber,
                profile.doorNumber,
              ].some(Boolean) ? (
                <ProfileRow
                  label="Bina / kapı"
                  value={
                    [
                      profile.buildingName,
                      profile.buildingNumber,
                      profile.doorNumber,
                    ]
                      .filter(Boolean)
                      .join(" ") || undefined
                  }
                />
              ) : null}
              <ProfileRow
                label="İl / ilçe"
                value={
                  [profile.city, profile.town].filter(Boolean).join(" / ") ||
                  undefined
                }
              />
              <ProfileRow label="Semt" value={profile.district} />
              <ProfileRow label="Posta kodu" value={profile.zipCode} />
              <ProfileRow label="Ülke" value={profile.country} />
            </Section>
          ) : null}

          {editingContact ? (
            <View style={styles.footerBlock}>
              {saveError ? (
                <Text style={styles.inlineError}>{saveError}</Text>
              ) : null}
              <View style={styles.footerActions}>
                <TouchableOpacity
                  style={styles.footerSecondaryBtn}
                  onPress={cancelEditContact}
                  disabled={saving}
                  accessibilityLabel="İletişim düzenlemeyi iptal et"
                >
                  <Text style={styles.footerSecondaryText}>İptal</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.footerPrimaryBtn}
                  onPress={() => void saveContact()}
                  disabled={saving}
                  accessibilityLabel="İletişim bilgilerini kaydet"
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.footerPrimaryText}>Kaydet</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.footerCta}
              onPress={beginEditContact}
              accessibilityLabel="İletişim bilgilerini düzenle"
              accessibilityRole="button"
            >
              <Text style={styles.footerCtaText}>
                İletişim Bilgilerini Düzenle
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: "600",
    color: "#000",
    textAlign: "center",
  },
  headerRight: {
    width: 40,
  },
  input: {
    fontSize: 15,
    color: "#111",
    paddingVertical: 4,
    minHeight: 28,
  },
  inlineError: {
    color: "#EF4444",
    fontSize: 14,
    marginBottom: 12,
    textAlign: "center",
  },
  scroll: {
    flex: 1,
  },
  scrollInner: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  hero: {
    alignItems: "center",
    paddingVertical: 20,
    marginBottom: 8,
  },
  avatarLarge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  avatarLargeText: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "600",
  },
  heroName: {
    fontSize: 20,
    fontWeight: "600",
    color: "#000",
    textAlign: "center",
  },
  heroSub: {
    fontSize: 13,
    color: "#888",
    marginTop: 6,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "600",
    color: "#ABABAB",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  sectionCard: {
    backgroundColor: "#F8F8F8",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  row: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E8E8E8",
  },
  rowLabel: {
    fontSize: 12,
    color: "#888",
    marginBottom: 4,
  },
  rowValue: {
    fontSize: 15,
    color: "#111",
    lineHeight: 22,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingBottom: 80,
    paddingHorizontal: 32,
  },
  errorText: {
    fontSize: 14,
    color: "#EF4444",
    textAlign: "center",
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: "#000",
    borderRadius: 10,
  },
  retryText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  footerCta: {
    marginTop: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
    backgroundColor: "#000",
    borderRadius: 12,
    alignItems: "center",
  },
  footerCtaText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  footerBlock: {
    marginTop: 8,
  },
  footerActions: {
    flexDirection: "row",
    gap: 12,
    alignItems: "stretch",
  },
  footerSecondaryBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#CCC",
    alignItems: "center",
    justifyContent: "center",
  },
  footerSecondaryText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#333",
  },
  footerPrimaryBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  footerPrimaryText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
});
