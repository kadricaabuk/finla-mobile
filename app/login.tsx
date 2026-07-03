import { clearLegacyCredentials, saveTokens } from "@/lib/session";
import {
  authLinkTenant,
  authRequestOtp,
  authSetPassword,
  authVerifyOtp,
  loginRequest,
  userFacingApiError,
} from "@/lib/supabase";
import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Mode =
  | "login"
  | "register_phone"
  | "register_otp"
  | "register_password"
  | "link_tenant";

async function persistAuthResponse(res: {
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
}) {
  if (!res.accessToken || !res.refreshToken) {
    throw new Error("Sunucudan oturum anahtarları alınamadı.");
  }
  const expiresIn = typeof res.expiresIn === "number" ? res.expiresIn : 900;
  await saveTokens({
    accessToken: res.accessToken,
    refreshToken: res.refreshToken,
    expiresAtMs: Date.now() + expiresIn * 1000,
  });
  await clearLegacyCredentials();
}

function normalizePhone(phone: string): string {
  return `0${phone}`;
}

export default function LoginScreen() {
  const [mode, setMode] = useState<Mode>("login");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [vkn, setVkn] = useState("6271036106");
  const [companyName, setCompanyName] = useState("");
  const [debugOtp, setDebugOtp] = useState<string | null>(null);
  const [pendingTokens, setPendingTokens] = useState<{
    accessToken: string;
    refreshToken: string;
    expiresIn?: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    const p = normalizePhone(phone.trim());
    const pass = password.trim();
    if (!p || !pass) {
      Alert.alert("Hata", "Telefon ve şifre gereklidir.");
      return;
    }
    setLoading(true);
    try {
      const res = await loginRequest(p, pass);
      if (!res.success) {
        Alert.alert("Giriş Başarısız", res.error ?? "Giriş yapılamadı.");
        return;
      }
      await persistAuthResponse(res);
      if (res.onboarding_status === "pending" || !res.tenant_vkn) {
        setPendingTokens({
          accessToken: res.accessToken!,
          refreshToken: res.refreshToken!,
          expiresIn: res.expiresIn,
        });
        setMode("link_tenant");
        return;
      }
      router.replace("/");
    } catch (err) {
      Alert.alert("Bağlantı Hatası", userFacingApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleRequestOtp = async () => {
    const p = normalizePhone(phone.trim());
    if (!p) {
      Alert.alert("Hata", "Telefon numarası gerekli.");
      return;
    }
    setLoading(true);
    try {
      const res = await authRequestOtp(p);
      if (!res.success) {
        Alert.alert("Hata", res.error ?? "Kod gönderilemedi.");
        return;
      }
      setDebugOtp(res.debug_code ?? null);
      setMode("register_otp");
    } catch (err) {
      Alert.alert("Bağlantı Hatası", userFacingApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    const p = normalizePhone(phone.trim());
    const code = otp.trim();
    if (!p || !code) {
      Alert.alert("Hata", "Telefon ve doğrulama kodu gerekli.");
      return;
    }
    setLoading(true);
    try {
      const res = await authVerifyOtp(p, code);
      if (!res.success) {
        Alert.alert("Hata", res.error ?? "Doğrulama başarısız.");
        return;
      }
      setMode("register_password");
    } catch (err) {
      Alert.alert("Bağlantı Hatası", userFacingApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSetPassword = async () => {
    const p = normalizePhone(phone.trim());
    const pass = password.trim();
    const confirm = passwordConfirm.trim();
    if (!p || !pass) {
      Alert.alert("Hata", "Telefon ve şifre gerekli.");
      return;
    }
    if (!/^\d{6}$/.test(pass)) {
      Alert.alert("Hata", "Şifre 6 haneli olmalı.");
      return;
    }
    if (pass !== confirm) {
      Alert.alert("Hata", "Şifreler eşleşmiyor.");
      return;
    }
    setLoading(true);
    try {
      const res = await authSetPassword(p, pass);
      if (!res.success) {
        Alert.alert("Hata", res.error ?? "Kayıt tamamlanamadı.");
        return;
      }
      await persistAuthResponse(res);
      setPendingTokens({
        accessToken: res.accessToken!,
        refreshToken: res.refreshToken!,
        expiresIn: res.expiresIn,
      });
      setMode("link_tenant");
    } catch (err) {
      Alert.alert("Bağlantı Hatası", userFacingApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleLinkTenant = async () => {
    const token = pendingTokens?.accessToken;
    const id = vkn.trim();
    if (!token || !id) {
      Alert.alert("Hata", "VKN/TCKN gerekli.");
      return;
    }
    setLoading(true);
    try {
      const res = await authLinkTenant(
        token,
        id,
        companyName.trim() || undefined,
      );
      if (!res.success) {
        Alert.alert("Hata", res.error ?? "Firma bağlanamadı.");
        return;
      }
      await persistAuthResponse(res);
      router.replace("/");
    } catch (err) {
      Alert.alert("Bağlantı Hatası", userFacingApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const title =
    mode === "login"
      ? "Giriş yap"
      : mode === "link_tenant"
        ? "Firmanı bağla"
        : "Hesap oluştur";

  const subtitle =
    mode === "login"
      ? "Telefon numaran ve şifrenle giriş yap."
      : mode === "register_phone"
        ? "Telefon numaranı gir; doğrulama kodu göndereceğiz."
        : mode === "register_otp"
          ? "SMS ile gelen 6 haneli kodu gir."
          : mode === "register_password"
            ? "Hesabın için 6 haneli bir şifre belir."
            : "Mysoft portalda seçtiğin firmanın VKN/TCKN'sini gir. Sandbox test firması: 6271036106";

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
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>

          <View style={styles.form}>
            {(mode === "login" ||
              mode === "register_phone" ||
              mode === "register_otp" ||
              mode === "register_password") && (
              <View style={styles.field}>
                <Text style={styles.label}>Telefon</Text>
                <View
                  style={{
                    flexDirection: "row",
                  }}
                >
                  <View style={styles.phonePrefix}>
                    <Text style={styles.phonePrefixText}>+90</Text>
                  </View>
                  <TextInput
                    testID="login-phone"
                    style={[
                      styles.input,
                      {
                        borderTopLeftRadius: 0,
                        borderBottomLeftRadius: 0,
                        flex: 1,
                      },
                    ]}
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    editable={mode === "login" || mode === "register_phone"}
                  />
                </View>
              </View>
            )}

            {mode === "register_otp" && (
              <View style={styles.field}>
                <Text style={styles.label}>Doğrulama kodu</Text>
                <TextInput
                  testID="login-otp"
                  style={styles.input}
                  value={otp}
                  onChangeText={setOtp}
                  keyboardType="number-pad"
                  maxLength={6}
                />
                {debugOtp ? (
                  <Text style={styles.devHint}>Test OTP: {debugOtp}</Text>
                ) : null}
              </View>
            )}

            {(mode === "login" || mode === "register_password") && (
              <>
                <View style={styles.field}>
                  <Text style={styles.label}>Şifre</Text>
                  <TextInput
                    testID="login-password"
                    style={styles.input}
                    value={password}
                    onChangeText={setPassword}
                    keyboardType="number-pad"
                    maxLength={6}
                    secureTextEntry
                  />
                </View>
                {mode === "register_password" && (
                  <View style={styles.field}>
                    <Text style={styles.label}>Şifre (tekrar)</Text>
                    <TextInput
                      style={styles.input}
                      value={passwordConfirm}
                      onChangeText={setPasswordConfirm}
                      keyboardType="number-pad"
                      maxLength={6}
                      secureTextEntry
                    />
                  </View>
                )}
              </>
            )}

            {mode === "link_tenant" && (
              <>
                <View style={styles.field}>
                  <Text style={styles.label}>VKN / TCKN</Text>
                  <TextInput
                    testID="login-vkn"
                    style={styles.input}
                    value={vkn}
                    onChangeText={setVkn}
                    placeholder="10 veya 11 hane"
                    placeholderTextColor="#ABABAB"
                    keyboardType="number-pad"
                  />
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>Firma adı (opsiyonel)</Text>
                  <TextInput
                    style={styles.input}
                    value={companyName}
                    onChangeText={setCompanyName}
                    placeholder="Unvan"
                    placeholderTextColor="#ABABAB"
                  />
                </View>
              </>
            )}

            <TouchableOpacity
              testID="login-submit"
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={() => {
                if (mode === "login") void handleLogin();
                else if (mode === "register_phone") void handleRequestOtp();
                else if (mode === "register_otp") void handleVerifyOtp();
                else if (mode === "register_password") void handleSetPassword();
                else if (mode === "link_tenant") void handleLinkTenant();
              }}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>
                  {mode === "login"
                    ? "Giriş Yap"
                    : mode === "register_phone"
                      ? "Kod Gönder"
                      : mode === "register_otp"
                        ? "Doğrula"
                        : mode === "register_password"
                          ? "Kaydı Tamamla"
                          : "Firmayı Bağla"}
                </Text>
              )}
            </TouchableOpacity>

            {mode === "login" ? (
              <TouchableOpacity
                onPress={() => {
                  setMode("register_phone");
                  setPassword("");
                }}
              >
                <Text style={styles.link}>Hesabın yok mu? Kayıt ol</Text>
              </TouchableOpacity>
            ) : mode !== "link_tenant" ? (
              <TouchableOpacity onPress={() => setMode("login")}>
                <Text style={styles.link}>Zaten hesabın var mı? Giriş yap</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <Text style={styles.note}>
            Test ortamında OTP kodu sunucu logunda görünür. Oturum anahtarları
            yalnızca cihazında saklanır.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  inner: { flex: 1, paddingHorizontal: 28 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingVertical: 24,
    paddingBottom: 40,
  },
  header: { marginBottom: 32 },
  logo: {
    fontSize: 36,
    fontWeight: "700",
    letterSpacing: -1,
    color: "#000",
    marginBottom: 12,
  },
  title: { fontSize: 22, fontWeight: "600", color: "#111", marginBottom: 8 },
  subtitle: { fontSize: 15, color: "#666", lineHeight: 22 },
  form: { gap: 16, marginBottom: 24 },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: "500", color: "#444" },
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
  devHint: { fontSize: 12, color: "#888", marginTop: 4 },
  button: {
    height: 52,
    borderRadius: 12,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { fontSize: 16, fontWeight: "600", color: "#fff" },
  link: {
    textAlign: "center",
    color: "#0066CC",
    fontSize: 14,
    marginTop: 8,
  },
  note: {
    fontSize: 12,
    color: "#ABABAB",
    textAlign: "center",
    lineHeight: 18,
  },
  phonePrefix: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
    borderWidth: 1.5,
    borderRadius: 12,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    paddingHorizontal: 16,
    height: 50,
  },
  phonePrefixText: { fontSize: 16, fontWeight: "500", color: "#FFFFFF" },
});
