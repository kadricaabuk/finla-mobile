import { clearLegacyCredentials, saveTokens } from "@/lib/session";
import { loginRequest, userFacingApiError } from "@/lib/supabase";
import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

function userFacingLoginError(
  errorCode?:
    | "MULTI_SESSION_PERSISTED"
    | "BAD_CREDENTIALS"
    | "GIB_TEMPORARY"
    | "UNKNOWN",
  rawError?: string,
): string {
  if (errorCode === "BAD_CREDENTIALS") {
    return "Kullanıcı kodu veya şifre hatalı görünüyor. Bilgilerinizi kontrol edip tekrar deneyin.";
  }
  if (errorCode === "GIB_TEMPORARY") {
    return "GİB servisi şu anda geçici olarak yanıt veremiyor. Lütfen birkaç dakika sonra tekrar deneyin.";
  }
  const msg = (rawError ?? "").toLowerCase();
  if (
    msg.includes("unexpected token") ||
    msg.includes("<html") ||
    msg.includes("not valid json")
  ) {
    return "GİB servisinden geçersiz yanıt alındı. Lütfen kısa bir süre sonra tekrar deneyin.";
  }
  return rawError?.trim() || "Giriş sırasında beklenmeyen bir sorun oluştu.";
}

export default function LoginScreen() {
  const [userCode, setUserCode] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    const u = userCode.trim();
    const p = password.trim();

    if (!u || !p) {
      Alert.alert("Hata", "Kullanıcı kodu ve şifre gereklidir.");
      return;
    }

    setLoading(true);
    try {
      const res = await loginRequest(u, p);

      if (!res.success) {
        if (res.error_code === "MULTI_SESSION_PERSISTED") {
          Alert.alert(
            "GİB Oturumu Açık",
            "GİB tarafında aktif bir oturum görünüyor. e-Arşiv Portal'da 'Güvenli Çıkış' yapıp 2-5 dakika sonra tekrar deneyin.",
          );
          return;
        }
        Alert.alert(
          "Giriş Başarısız",
          userFacingLoginError(res.error_code, res.error),
        );
        return;
      }

      if (!res.accessToken || !res.refreshToken) {
        Alert.alert(
          "Giriş Başarısız",
          "Sunucudan oturum anahtarları alınamadı.",
        );
        return;
      }
      const expiresIn = typeof res.expiresIn === "number" ? res.expiresIn : 900;
      await saveTokens({
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
        expiresAtMs: Date.now() + expiresIn * 1000,
      });
      await clearLegacyCredentials();
      router.replace("/");
    } catch (err) {
      Alert.alert("Bağlantı Hatası", userFacingApiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.inner}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.header}>
            <Text style={styles.logo}>finla</Text>
            <Text style={styles.subtitle}>
              İnteraktif Vergi Dairesi kullanıcı kodunuz ve şifrenizle giriş
              yapın{" "}
              <Text style={{ fontWeight: "bold" }}>
                (TC kimlik / vergi kimlik no ile giriş yapılamaz)
              </Text>
              .
            </Text>
          </View>

          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={styles.label}>Kullanıcı Kodu</Text>
              <TextInput
                nativeID="kullaniciKodu"
                accessibilityLabel="Kullanıcı kodu"
                style={styles.input}
                value={userCode}
                onChangeText={setUserCode}
                placeholder="Kullanıcı Kodu"
                placeholderTextColor="#ABABAB"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                textContentType="username"
                returnKeyType="next"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Şifre</Text>
              <TextInput
                nativeID="sifre"
                accessibilityLabel="Şifre"
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="Şifre"
                placeholderTextColor="#ABABAB"
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="password"
                textContentType="password"
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />
            </View>

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Giriş Yap</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.explanationBlock}>
            <Text style={styles.explanationText}>
              İnteraktif Vergi Dairesi Kullanıcı Kodunuza{" "}
              <Text
                style={styles.explanationLink}
                onPress={() => Linking.openURL("https://ivd.gib.gov.tr/")}
                accessibilityRole="link"
              >
                https://ivd.gib.gov.tr/
              </Text>{" "}
              adresinden uygulamaya giriş yaparak ‘Bilgilerim/Sicil Kaydım’
              alanından ulaşabilirsiniz.
            </Text>
          </View>

          <Text style={styles.note}>
            Bu uygulama GİB e-Arşiv portalındaki bilgilerinizi kullanır. Oturum
            anahtarları yalnızca cihazınızda güvenli depoda saklanır.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  inner: {
    flex: 1,
    paddingHorizontal: 28,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingVertical: 24,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 48,
  },
  logo: {
    fontSize: 36,
    fontWeight: "700",
    letterSpacing: -1,
    color: "#000",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
    lineHeight: 22,
  },
  form: {
    gap: 16,
    marginBottom: 32,
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: "500",
    color: "#444",
    letterSpacing: 0.1,
  },
  input: {
    height: 50,
    borderWidth: 1.5,
    borderColor: "#E0E0E0",
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: "#000",
    backgroundColor: "#FAFAFA",
  },
  button: {
    height: 52,
    borderRadius: 12,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  explanationBlock: {
    marginBottom: 24,
    gap: 8,
  },
  explanationHeading: {
    fontSize: 14,
    fontWeight: "600",
    color: "#444",
  },
  explanationText: {
    fontSize: 13,
    color: "#555",
    lineHeight: 20,
  },
  explanationLink: {
    fontSize: 13,
    color: "#0066CC",
    textDecorationLine: "underline",
  },
  note: {
    fontSize: 12,
    color: "#ABABAB",
    textAlign: "center",
    lineHeight: 18,
    position: "absolute",
    bottom: 0,
    backgroundColor: "#f4f4f4",
    paddingVertical: 16,
    paddingHorizontal: 28,
    borderRadius: 12,
  },
});
