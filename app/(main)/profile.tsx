import ProfileScreen from "@/components/profile/profile-screen";
import { useMainAppShell } from "@/contexts/main-app-shell-context";
import { Redirect } from "expo-router";

export default function ProfileRoute() {
  const { features } = useMainAppShell();
  if (!features.profile) {
    return <Redirect href="/" />;
  }
  return <ProfileScreen />;
}
