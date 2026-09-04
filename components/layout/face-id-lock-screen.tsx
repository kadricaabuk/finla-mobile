import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const SPLASH_LOGO = require("@/assets/images/splash-icon.png");

type Props = {
  subtitle: string;
  scanning: boolean;
  showPinButton: boolean;
  onPinLogin: () => void;
  pinLoading?: boolean;
};

export function FaceIdLockScreen({
  subtitle,
  scanning,
  showPinButton,
  onPinLogin,
  pinLoading = false,
}: Props) {
  return (
    <View style={styles.canvas}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.content}>
        <Image
          source={SPLASH_LOGO}
          style={styles.logo}
          contentFit="contain"
        />
        <Text style={styles.subtitle}>{subtitle}</Text>
        {scanning ? (
          <ActivityIndicator
            size="small"
            color="rgba(255,255,255,0.6)"
            style={styles.spinner}
          />
        ) : null}
        {showPinButton ? (
          <Pressable
            testID="unlock-pin-login"
            onPress={onPinLogin}
            disabled={pinLoading}
            accessibilityLabel="PIN ile giriş yap"
            style={({ pressed }) => [
              styles.pinButton,
              pressed && styles.pinButtonPressed,
              pinLoading && styles.pinButtonDisabled,
            ]}
          >
            {pinLoading ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Text style={styles.pinButtonText}>PIN ile giriş yap</Text>
            )}
          </Pressable>
        ) : null}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    flex: 1,
    backgroundColor: "#000",
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  logo: {
    width: 220,
    aspectRatio: 814 / 395,
  },
  subtitle: {
    marginTop: 28,
    fontSize: 16,
    lineHeight: 22,
    color: "rgba(255,255,255,0.72)",
    textAlign: "center",
  },
  spinner: {
    marginTop: 24,
  },
  pinButton: {
    marginTop: 32,
    minWidth: 200,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  pinButtonPressed: {
    opacity: 0.88,
  },
  pinButtonDisabled: {
    opacity: 0.7,
  },
  pinButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000",
  },
});
