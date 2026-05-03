import { useMainAppShell } from "@/contexts/main-app-shell-context";
import {
  getUserProfile,
  updateUserProfile,
  userFacingApiError,
  type UserProfile,
} from "@/lib/supabase";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";

export type ContactDraftKey = "phoneNumber" | "faxNumber" | "email" | "webSite";

const CONTACT_KEYS: ContactDraftKey[] = [
  "phoneNumber",
  "faxNumber",
  "email",
  "webSite",
];

function contactDraftFromProfile(
  p: UserProfile,
): Record<ContactDraftKey, string> {
  return {
    phoneNumber: p.phoneNumber ?? "",
    faxNumber: p.faxNumber ?? "",
    email: p.email ?? "",
    webSite: p.webSite ?? "",
  };
}

function buildContactPatch(
  original: UserProfile,
  draft: Record<ContactDraftKey, string>,
): Partial<UserProfile> {
  const patch: Partial<UserProfile> = {};
  for (const key of CONTACT_KEYS) {
    const a = (original[key] ?? "").trim();
    const b = (draft[key] ?? "").trim();
    if (a !== b) {
      (patch as Record<string, string>)[key] = draft[key];
    }
  }
  return patch;
}

export function useProfileScreen() {
  const { closeMenu } = useMainAppShell();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingContact, setEditingContact] = useState(false);
  const [contactDraft, setContactDraft] = useState<Record<
    ContactDraftKey,
    string
  > | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadProfile = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const res = await getUserProfile();
      setProfile(res.profile);
    } catch (err) {
      setError(userFacingApiError(err));
      setProfile(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile(false);
  }, [loadProfile]);

  const beginEditContact = useCallback(() => {
    if (!profile) return;
    setContactDraft(contactDraftFromProfile(profile));
    setEditingContact(true);
    setSaveError(null);
  }, [profile]);

  const cancelEditContact = useCallback(() => {
    setEditingContact(false);
    setContactDraft(null);
    setSaveError(null);
  }, []);

  const updateContactField = useCallback(
    (key: ContactDraftKey, value: string) => {
      setContactDraft((d) => (d ? { ...d, [key]: value } : null));
    },
    [],
  );

  const saveContact = useCallback(async () => {
    if (!profile || !contactDraft) return;
    const patch = buildContactPatch(profile, contactDraft);
    if (Object.keys(patch).length === 0) {
      setEditingContact(false);
      setContactDraft(null);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const res = await updateUserProfile(patch);
      setProfile(res.profile);
      setEditingContact(false);
      setContactDraft(null);
    } catch (err) {
      setSaveError(userFacingApiError(err));
    } finally {
      setSaving(false);
    }
  }, [profile, contactDraft]);

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

  return {
    profile,
    loading,
    refreshing,
    error,
    refreshProfile: () => loadProfile(true),
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
  };
}
