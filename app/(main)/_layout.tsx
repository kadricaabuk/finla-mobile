import { MainAppShellProvider } from "@/contexts/main-app-shell-context";
import { Stack } from "expo-router";

export default function MainLayout() {
  return (
    <MainAppShellProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </MainAppShellProvider>
  );
}
