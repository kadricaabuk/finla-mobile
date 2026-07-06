import { Image } from "expo-image";
import { useEffect, useState } from "react";
import {
  AppState,
  type AppStateStatus,
  StyleSheet,
  View,
} from "react-native";

// Uygulama arka plana geçerken (app switcher / görev listesi anlık görüntüsü)
// fatura ve finans verisinin ekranda kalmaması için native splash ile aynı
// kare (siyah zemin + wordmark) basılır. iOS "inactive" durumunda da gösterilir;
// böylece sistem diyalogları ve app switcher'a geçişte içerik hiç görünmez.
export function PrivacyCover() {
  const [appState, setAppState] = useState<AppStateStatus>(
    AppState.currentState,
  );

  useEffect(() => {
    const sub = AppState.addEventListener("change", setAppState);
    return () => sub.remove();
  }, []);

  if (appState === "active") return null;

  return (
    <View style={styles.container} pointerEvents="none">
      <Image
        source={require("@/assets/images/splash-icon.png")}
        style={styles.wordmark}
        contentFit="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    elevation: 1000,
  },
  wordmark: {
    width: 220,
    aspectRatio: 814 / 395,
  },
});
