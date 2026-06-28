import { useMainAppShell } from "@/contexts/main-app-shell-context";
import { useDrawerChatNavigation } from "@/hooks/use-drawer-chat-navigation";
import {
  updateUserProfile,
  userFacingApiError,
  type UserProfile,
} from "@/lib/supabase";
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
  const { userProfile, refreshUserProfile } = useMainAppShell();
  const { handleDrawerNewChat, handleDrawerOpenConversation } =
    useDrawerChatNavigation();

  const [profile, setProfile] = useState<UserProfile | null>(userProfile);
  const [loading, setLoading] = useState(!userProfile);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingContact, setEditingContact] = useState(false);
  const [contactDraft, setContactDraft] = useState<Record<
    ContactDraftKey,
    string
  > | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (userProfile) {
      setProfile(userProfile);
      setLoading(false);
      setError(null);
    }
  }, [userProfile]);

  const refreshProfile = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      await refreshUserProfile();
    } catch (err) {
      setError(userFacingApiError(err));
    } finally {
      setRefreshing(false);
    }
  }, [refreshUserProfile]);

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
      await refreshUserProfile();
    } catch (err) {
      setSaveError(userFacingApiError(err));
    } finally {
      setSaving(false);
    }
  }, [profile, contactDraft, refreshUserProfile]);

  return {
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
  };
}
