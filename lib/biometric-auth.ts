import * as LocalAuthentication from "expo-local-authentication";
import { AuthenticationType } from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { Alert, Platform } from "react-native";

const KEY_ENABLED = "finla_biometric_enabled";
const KEY_PROMPT_SHOWN = "finla_biometric_prompt_shown";

export type BiometricLabels = {
  /** Kısa ad: Face ID, Parmak izi, Biyometrik */
  name: string;
  optInTitle: string;
  optInMessage: string;
  optInButton: string;
  promptMessage: string;
  scanningSubtitle: string;
};

const IOS_FACE_ID: BiometricLabels = {
  name: "Face ID",
  optInTitle: "Face ID",
  optInMessage:
    "Uygulamayı her açışında Face ID ile hızlıca giriş yapabilirsin.",
  optInButton: "Face ID'yi Aç",
  promptMessage: "Finla'ya erişmek için Face ID kullan",
  scanningSubtitle: "Face ID ile doğrulanıyor…",
};

const IOS_TOUCH_ID: BiometricLabels = {
  name: "Touch ID",
  optInTitle: "Touch ID",
  optInMessage:
    "Uygulamayı her açışında Touch ID ile hızlıca giriş yapabilirsin.",
  optInButton: "Touch ID'yi Aç",
  promptMessage: "Finla'ya erişmek için Touch ID kullan",
  scanningSubtitle: "Touch ID ile doğrulanıyor…",
};

const ANDROID_FINGERPRINT: BiometricLabels = {
  name: "Parmak izi",
  optInTitle: "Parmak izi kilidi",
  optInMessage:
    "Uygulamayı her açışında parmak izinle hızlıca giriş yapabilirsin.",
  optInButton: "Parmak izini Aç",
  promptMessage: "Finla'ya erişmek için parmak izini kullan",
  scanningSubtitle: "Parmak izi ile doğrulanıyor…",
};

const ANDROID_FACE: BiometricLabels = {
  name: "Yüz tanıma",
  optInTitle: "Yüz tanıma kilidi",
  optInMessage:
    "Uygulamayı her açışında yüz tanımayla hızlıca giriş yapabilirsin.",
  optInButton: "Yüz tanımayı Aç",
  promptMessage: "Finla'ya erişmek için yüz tanımayı kullan",
  scanningSubtitle: "Yüz tanıma ile doğrulanıyor…",
};

const BIOMETRIC_GENERIC: BiometricLabels = {
  name: "Biyometrik doğrulama",
  optInTitle: "Biyometrik kilit",
  optInMessage:
    "Uygulamayı her açışında biyometrik doğrulamayla hızlıca giriş yapabilirsin.",
  optInButton: "Biyometriyi Aç",
  promptMessage: "Finla'ya erişmek için biyometrik doğrulamayı kullan",
  scanningSubtitle: "Biyometrik doğrulama yapılıyor…",
};

let cachedLabels: BiometricLabels | null = null;

export function isBiometricPlatform(): boolean {
  return Platform.OS === "ios" || Platform.OS === "android";
}

export async function isBiometricHardwareAvailable(): Promise<boolean> {
  if (!isBiometricPlatform()) return false;
  const [hasHardware, isEnrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ]);
  return hasHardware && isEnrolled;
}

export async function getBiometricLabels(): Promise<BiometricLabels> {
  if (cachedLabels) return cachedLabels;

  const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
  const hasFace = types.includes(AuthenticationType.FACIAL_RECOGNITION);
  const hasFinger = types.includes(AuthenticationType.FINGERPRINT);

  if (Platform.OS === "ios") {
    cachedLabels = hasFace
      ? IOS_FACE_ID
      : hasFinger
        ? IOS_TOUCH_ID
        : IOS_FACE_ID;
    return cachedLabels;
  }

  if (hasFinger && !hasFace) {
    cachedLabels = ANDROID_FINGERPRINT;
  } else if (hasFace && !hasFinger) {
    cachedLabels = ANDROID_FACE;
  } else {
    cachedLabels = BIOMETRIC_GENERIC;
  }
  return cachedLabels;
}

export async function getBiometricEnabled(): Promise<boolean> {
  if (!isBiometricPlatform()) return false;
  return (await SecureStore.getItemAsync(KEY_ENABLED)) === "1";
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(KEY_ENABLED, enabled ? "1" : "0");
}

export async function getBiometricPromptShown(): Promise<boolean> {
  return (await SecureStore.getItemAsync(KEY_PROMPT_SHOWN)) === "1";
}

export async function setBiometricPromptShown(): Promise<void> {
  await SecureStore.setItemAsync(KEY_PROMPT_SHOWN, "1");
}

export async function authenticateWithBiometric(): Promise<LocalAuthentication.LocalAuthenticationResult> {
  const labels = await getBiometricLabels();
  return LocalAuthentication.authenticateAsync({
    promptMessage: labels.promptMessage,
    promptSubtitle: labels.scanningSubtitle,
    cancelLabel: "İptal",
    disableDeviceFallback: true,
  });
}

function showEnableBiometricAlert(labels: BiometricLabels): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      labels.optInTitle,
      labels.optInMessage,
      [
        {
          text: "Şimdi değil",
          style: "cancel",
          onPress: () => resolve(false),
        },
        {
          text: labels.optInButton,
          onPress: () => resolve(true),
        },
      ],
      { cancelable: false },
    );
  });
}

export type BiometricSetupResult = {
  enabled: boolean;
  /** Biyometri başarıyla doğrulandıysa true (aynı oturumda tekrar tarama gerekmez). */
  verified: boolean;
};

/**
 * Post-login / post-registration opt-in. Marks the one-time prompt as shown.
 */
export async function offerBiometricSetupAfterAuth(): Promise<BiometricSetupResult> {
  if (!(await isBiometricHardwareAvailable())) {
    return { enabled: false, verified: false };
  }

  const labels = await getBiometricLabels();
  const accept = await showEnableBiometricAlert(labels);
  await setBiometricPromptShown();

  if (!accept) return { enabled: false, verified: false };

  const probe = await authenticateWithBiometric();
  if (!probe.success) return { enabled: false, verified: false };

  await setBiometricEnabled(true);
  return { enabled: true, verified: true };
}

/**
 * First cold start for existing users who already have a session.
 */
export async function offerBiometricSetupOnColdStart(): Promise<BiometricSetupResult> {
  if (await getBiometricPromptShown()) {
    const enabled = await getBiometricEnabled();
    return { enabled, verified: false };
  }
  return offerBiometricSetupAfterAuth();
}
