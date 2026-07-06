import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, View } from "react-native";

/** Native splash ile aynı kare — arka plan / görev yöneticisinde içeriği gizler. */
export function PrivacySplashOverlay() {
  return (
    <View style={styles.container} pointerEvents="none">
      <StatusBar style="light" />
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
    zIndex: 9999,
    elevation: 9999,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
  wordmark: {
    width: 220,
    aspectRatio: 814 / 395,
  },
});
