import { releaseNativeSplash } from "@/lib/splash-handoff";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, StyleSheet, View } from "react-native";

// Native splash ile piksel piksel aynı görünür (siyah zemin + 220pt wordmark);
// splash → bootstrap → login zinciri kesintisiz akar. Bu kare çizildikten
// sonra native splash zamanlanmış şekilde kapatılır (lib/splash-handoff).
export function SessionBootstrapPlaceholder() {
  return (
    <View
      style={styles.container}
      onLayout={() => {
        void releaseNativeSplash();
      }}
    >
      <StatusBar style="light" />
      <Image
        source={require("@/assets/images/splash-icon.png")}
        style={styles.wordmark}
        contentFit="contain"
      />
      <ActivityIndicator
        size="small"
        color="rgba(255,255,255,0.6)"
        style={styles.spinner}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
  wordmark: {
    width: 220,
    aspectRatio: 814 / 395,
  },
  spinner: {
    position: "absolute",
    bottom: 96,
    alignSelf: "center",
  },
});
