import { AppLockProvider } from "@/contexts/app-lock-context";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import { SafeAreaProvider } from "react-native-safe-area-context";

// Native splash'i otomatik kapatma; ilk ekran (bootstrap placeholder veya
// login) birebir aynı kareyi çizdikten sonra kendisi kapatır.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppLockProvider>
          <Stack screenOptions={{ headerShown: false }}>
            {/* animation: "none" — bootstrap placeholder'dan (splash klonu) bu
                ekranlara geçiş kayma olmadan, kesme ile olmalı. */}
            <Stack.Screen name="login" options={{ animation: "none" }} />
            <Stack.Screen name="onboarding" options={{ animation: "none" }} />
            <Stack.Screen name="unlock" options={{ animation: "none" }} />
            <Stack.Screen name="(main)" />
          </Stack>
          <StatusBar style="dark" />
        </AppLockProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
