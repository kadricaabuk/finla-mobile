import { clearLegacyCredentials, saveTokens } from "@/lib/session";
import {
  authLinkTenant,
  authRequestOtp,
  authSetPassword,
  authVerifyOtp,
  loginRequest,
  userFacingApiError,
} from "@/lib/supabase";
import { claimSplashHandoff, releaseNativeSplash } from "@/lib/splash-handoff";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

const SPLASH_LOGO = require("@/assets/images/splash-icon.png");
// Native splash: 220pt genişlikte wordmark (app.json → expo-splash-screen).
const SPLASH_LOGO_WIDTH = 220;
const LOGO_ASPECT_RATIO = 814 / 395;

type Mode =
  | "login"
  | "register_phone"
  | "register_otp"
  | "register_password"
  | "link_tenant";

const REGISTER_STEPS: Mode[] = [
  "register_phone",
  "register_otp",
  "register_password",
];

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

function CodeField({
  value,
  onChange,
  secure,
  testID,
  autoFocus,
  textContentType,
  inputRef: externalInputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  secure?: boolean;
  testID?: string;
  autoFocus?: boolean;
  textContentType?: "oneTimeCode" | "password" | "newPassword";
  inputRef?: React.RefObject<TextInput | null>;
}) {
  const internalInputRef = useRef<TextInput>(null);
  const inputRef = externalInputRef ?? internalInputRef;
  const [focused, setFocused] = useState(false);
  const activeIndex = Math.min(value.length, 5);

  return (
    <Pressable onPress={() => inputRef.current?.focus()}>
      <View style={styles.codeRow}>
        {Array.from({ length: 6 }).map((_, i) => {
          const char = value[i];
          const isActive = focused && i === activeIndex;
          return (
            <View
              key={i}
              style={[
                styles.codeCell,
                char != null && styles.codeCellFilled,
                isActive && styles.codeCellActive,
              ]}
            >
              {char != null ? (
                secure ? (
                  <View style={styles.codeDot} />
                ) : (
                  <Text style={styles.codeChar}>{char}</Text>
                )
              ) : null}
            </View>
          );
        })}
      </View>
      <TextInput
        ref={inputRef}
        testID={testID}
        style={styles.codeHiddenInput}
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, "").slice(0, 6))}
        keyboardType="number-pad"
        maxLength={6}
        autoFocus={autoFocus}
        caretHidden
        textContentType={textContentType}
        autoComplete={textContentType === "oneTimeCode" ? "sms-otp" : "off"}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </Pressable>
  );
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
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [pendingTokens, setPendingTokens] = useState<{
    accessToken: string;
    refreshToken: string;
    expiresIn?: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const otpAutoSubmittedRef = useRef(false);
  const phoneAutoSubmittedRef = useRef(false);
  const confirmPinInputRef = useRef<TextInput>(null);

  // Splash → login geçiş animasyonu (yalnızca açılıştaki ilk mount'ta oynar).
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  // Native splash (storyboard) logoyu tam ekran merkezine koyar; klon katman
  // ve animasyon başlangıcı da aynı merkezi kullanır.
  const splashCenterY = windowHeight / 2;
  const reducedMotion = useReducedMotion();
  const [handoff] = useState(() => claimSplashHandoff() && !reducedMotion);
  const [logoSlot, setLogoSlot] = useState<{
    dx: number;
    dy: number;
    scale: number;
  } | null>(null);
  const logoSlotRef = useRef<View>(null);
  const [splashHidden, setSplashHidden] = useState(!handoff);
  const logoProgress = useSharedValue(handoff ? 0 : 1);
  const sheetProgress = useSharedValue(handoff ? 0 : 1);
  const fadeProgress = useSharedValue(handoff ? 0 : 1);

  useEffect(() => {
    if (!handoff) return;
    // Native splash zamanlanmış şekilde kapanana kadar bekle: klon katman
    // altta hazır dururken native kapanır, animasyon ondan sonra başlar.
    void releaseNativeSplash().then(() => setSplashHidden(true));
  }, [handoff]);

  // Animasyon ancak native splash kapandıktan VE logonun header'daki yeri
  // ölçüldükten sonra başlar; o ana kadar splash'in birebir kopyası görünür.
  const handoffReady = handoff && splashHidden && logoSlot != null;

  useEffect(() => {
    if (!handoffReady) return;
    logoProgress.value = withDelay(
      120,
      withTiming(1, { duration: 520, easing: Easing.bezier(0.3, 0.7, 0, 1) }),
    );
    sheetProgress.value = withDelay(
      200,
      withTiming(1, { duration: 480, easing: Easing.bezier(0.16, 1, 0.3, 1) }),
    );
    fadeProgress.value = withDelay(
      340,
      withTiming(1, { duration: 340, easing: Easing.out(Easing.cubic) }),
    );
  }, [handoffReady, logoProgress, sheetProgress, fadeProgress]);

  // Slot ölçümü mount sırasında güvenilir değil (ekran konteyneri henüz
  // yerine oturmamış oluyor); native splash kapandıktan sonra — ekran
  // kesin yerleşmişken — ölçülür. O ana kadar statik kapak görünür.
  useEffect(() => {
    if (!handoff || !splashHidden || logoSlot) return;
    let cancelled = false;
    let last: { x: number; y: number } | null = null;
    const attempt = (triesLeft: number) => {
      if (cancelled) return;
      logoSlotRef.current?.measureInWindow((x, y, w, h) => {
        if (cancelled) return;
        if (w && h) {
          const stable =
            last && Math.abs(last.x - x) < 0.5 && Math.abs(last.y - y) < 0.5;
          if (stable || triesLeft <= 0) {
            setLogoSlot({
              dx: windowWidth / 2 - (x + w / 2),
              dy: splashCenterY - (y + h / 2),
              scale: SPLASH_LOGO_WIDTH / w,
            });
            return;
          }
          last = { x, y };
        }
        if (triesLeft > 0) {
          requestAnimationFrame(() => attempt(triesLeft - 1));
        }
      });
    };
    attempt(30);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handoff, splashHidden, logoSlot]);

  const logoAnimatedStyle = useAnimatedStyle(() => {
    if (!logoSlot) return { opacity: handoff ? 0 : 1 };
    const rest = 1 - logoProgress.value;
    return {
      opacity: 1,
      transform: [
        { translateX: logoSlot.dx * rest },
        { translateY: logoSlot.dy * rest },
        { scale: 1 + (logoSlot.scale - 1) * rest },
      ],
    };
  });

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - sheetProgress.value) * windowHeight }],
  }));

  const fadeAnimatedStyle = useAnimatedStyle(() => ({
    opacity: fadeProgress.value,
    transform: [{ translateY: (1 - fadeProgress.value) * 12 }],
  }));

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

  const handleRequestOtp = async (phoneOverride?: string) => {
    const p = normalizePhone((phoneOverride ?? phone).trim());
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
      otpAutoSubmittedRef.current = false;
      setMode("register_otp");
    } catch (err) {
      Alert.alert("Bağlantı Hatası", userFacingApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (codeOverride?: string) => {
    const p = normalizePhone(phone.trim());
    const code = (codeOverride ?? otp).trim();
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

  const registerStepIndex = REGISTER_STEPS.indexOf(mode);
  const isRegisterStep = registerStepIndex >= 0;

  const goBack = () => {
    if (mode === "register_phone") {
      setMode("login");
    } else if (mode === "register_otp") {
      setOtp("");
      setDebugOtp(null);
      phoneAutoSubmittedRef.current = false;
      setMode("register_phone");
    } else if (mode === "register_password") {
      setPassword("");
      setPasswordConfirm("");
      setOtp("");
      phoneAutoSubmittedRef.current = false;
      setMode("register_phone");
    }
  };

  const title =
    mode === "login"
      ? "Giriş yap"
      : mode === "link_tenant"
        ? "Firmanı bağla"
        : mode === "register_phone"
          ? "Hesap oluştur"
          : mode === "register_otp"
            ? "Kodu doğrula"
            : "PIN belirle";

  const subtitle =
    mode === "login"
      ? "Telefon numaran ve 6 haneli PIN'in ile giriş yap."
      : mode === "register_phone"
        ? "Telefon numaranı gir; SMS ile doğrulama kodu göndereceğiz."
        : mode === "register_otp"
          ? `+90 ${phone.trim()} numarasına gönderilen 6 haneli kodu gir.`
          : mode === "register_password"
            ? "Girişte kullanacağın 6 haneli PIN'i belirle."
            : "Mysoft portalda seçtiğin firmanın VKN/TCKN'sini gir.";

  const buttonLabel =
    mode === "login"
      ? "Giriş Yap"
      : mode === "register_phone"
        ? "Kod Gönder"
        : mode === "register_otp"
          ? "Doğrula"
          : mode === "register_password"
            ? "Kaydı Tamamla"
            : "Firmayı Bağla";

  const handleSubmit = () => {
    if (mode === "login") void handleLogin();
    else if (mode === "register_phone") void handleRequestOtp();
    else if (mode === "register_otp") void handleVerifyOtp();
    else if (mode === "register_password") void handleSetPassword();
    else if (mode === "link_tenant") void handleLinkTenant();
  };

  const showPhoneField = mode === "login" || mode === "register_phone";

  return (
    <View style={styles.canvas}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <SafeAreaView edges={["top"]} style={styles.header}>
          <View style={styles.headerTopRow}>
            <Animated.View style={logoAnimatedStyle}>
              <View ref={logoSlotRef}>
                <Image
                  source={SPLASH_LOGO}
                  style={styles.logo}
                  contentFit="contain"
                />
              </View>
            </Animated.View>
            {isRegisterStep && (
              <TouchableOpacity
                onPress={goBack}
                hitSlop={12}
                disabled={loading}
                style={styles.backButton}
              >
                <Ionicons name="chevron-back" size={16} color="#fff" />
                <Text style={styles.backText}>Geri</Text>
              </TouchableOpacity>
            )}
          </View>

          <Animated.View style={fadeAnimatedStyle}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>

            {isRegisterStep && (
              <View style={styles.progressRow}>
                {REGISTER_STEPS.map((step, i) => (
                  <View
                    key={step}
                    style={[
                      styles.progressSegment,
                      i <= registerStepIndex && styles.progressSegmentDone,
                    ]}
                  />
                ))}
              </View>
            )}
            {mode === "link_tenant" && (
              <Text style={styles.eyebrow}>SON ADIM</Text>
            )}
          </Animated.View>
        </SafeAreaView>

        <Animated.View style={[styles.sheet, sheetAnimatedStyle]}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.sheetContent}
          >
            {showPhoneField && (
              <View style={styles.field}>
                <Text style={styles.label}>Telefon</Text>
                <View
                  style={[
                    styles.phoneRow,
                    focusedField === "phone" && styles.inputFocused,
                  ]}
                >
                  <Text style={styles.phonePrefix}>+90</Text>
                  <View style={styles.phoneDivider} />
                  <TextInput
                    testID="login-phone"
                    style={styles.phoneInput}
                    value={phone}
                    onChangeText={(v) => {
                      setPhone(v);
                      if (
                        mode === "register_phone" &&
                        v.replace(/\D/g, "").length === 10 &&
                        !phoneAutoSubmittedRef.current &&
                        !loading
                      ) {
                        phoneAutoSubmittedRef.current = true;
                        void handleRequestOtp(v);
                      }
                    }}
                    keyboardType="phone-pad"
                    placeholder="5XX XXX XX XX"
                    placeholderTextColor="#B4B4BE"
                    onFocus={() => setFocusedField("phone")}
                    onBlur={() => setFocusedField(null)}
                  />
                </View>
              </View>
            )}

            {mode === "register_otp" && (
              <View style={styles.field}>
                <Text style={styles.label}>Doğrulama kodu</Text>
                <CodeField
                  testID="login-otp"
                  value={otp}
                  onChange={(v) => {
                    setOtp(v);
                    if (
                      v.length === 6 &&
                      !otpAutoSubmittedRef.current &&
                      !loading
                    ) {
                      otpAutoSubmittedRef.current = true;
                      void handleVerifyOtp(v);
                    }
                  }}
                  autoFocus
                  textContentType="oneTimeCode"
                />
                {debugOtp ? (
                  <View style={styles.devHintChip}>
                    <Text style={styles.devHintText}>Test OTP: {debugOtp}</Text>
                  </View>
                ) : null}
              </View>
            )}

            {mode === "login" && (
              <View style={styles.field}>
                <Text style={styles.label}>PIN</Text>
                <CodeField
                  testID="login-password"
                  value={password}
                  onChange={setPassword}
                  secure
                  textContentType="password"
                />
              </View>
            )}

            {mode === "register_password" && (
              <>
                <View style={styles.field}>
                  <Text style={styles.label}>Yeni PIN</Text>
                  <CodeField
                    testID="login-password"
                    value={password}
                    onChange={(v) => {
                      setPassword(v);
                      if (v.length === 6) confirmPinInputRef.current?.focus();
                    }}
                    secure
                    autoFocus
                    textContentType="newPassword"
                  />
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>PIN (tekrar)</Text>
                  <CodeField
                    value={passwordConfirm}
                    onChange={setPasswordConfirm}
                    secure
                    textContentType="newPassword"
                    inputRef={confirmPinInputRef}
                  />
                </View>
              </>
            )}

            {mode === "link_tenant" && (
              <>
                <View style={styles.field}>
                  <Text style={styles.label}>VKN / TCKN</Text>
                  <TextInput
                    testID="login-vkn"
                    style={[
                      styles.input,
                      focusedField === "vkn" && styles.inputFocused,
                    ]}
                    value={vkn}
                    onChangeText={setVkn}
                    placeholder="10 veya 11 hane"
                    placeholderTextColor="#B4B4BE"
                    keyboardType="number-pad"
                    onFocus={() => setFocusedField("vkn")}
                    onBlur={() => setFocusedField(null)}
                  />
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>Firma adı (opsiyonel)</Text>
                  <TextInput
                    style={[
                      styles.input,
                      focusedField === "company" && styles.inputFocused,
                    ]}
                    value={companyName}
                    onChangeText={setCompanyName}
                    placeholder="Unvan"
                    placeholderTextColor="#B4B4BE"
                    onFocus={() => setFocusedField("company")}
                    onBlur={() => setFocusedField(null)}
                  />
                </View>
                <View style={styles.devHintChip}>
                  <Text style={styles.devHintText}>
                    Sandbox test firması: 6271036106
                  </Text>
                </View>
              </>
            )}

            <TouchableOpacity
              testID="login-submit"
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>{buttonLabel}</Text>
              )}
            </TouchableOpacity>

            {mode === "login" ? (
              <TouchableOpacity
                onPress={() => {
                  setPassword("");
                  phoneAutoSubmittedRef.current = false;
                  setMode("register_phone");
                }}
                hitSlop={8}
              >
                <Text style={styles.link}>
                  Hesabın yok mu?{" "}
                  <Text style={styles.linkStrong}>Kayıt ol</Text>
                </Text>
              </TouchableOpacity>
            ) : isRegisterStep ? (
              <TouchableOpacity onPress={() => setMode("login")} hitSlop={8}>
                <Text style={styles.link}>
                  Zaten hesabın var mı?{" "}
                  <Text style={styles.linkStrong}>Giriş yap</Text>
                </Text>
              </TouchableOpacity>
            ) : null}

            <Text style={styles.note}>
              Test ortamında OTP kodu sunucu logunda görünür. Oturum anahtarları
              yalnızca cihazında saklanır.
            </Text>
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>

      {handoff && !handoffReady && (
        <View style={styles.splashCover} pointerEvents="none">
          <Image
            source={SPLASH_LOGO}
            style={styles.splashCoverLogo}
            contentFit="contain"
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { flex: 1, backgroundColor: "#000" },
  flex: { flex: 1 },
  header: {
    paddingHorizontal: 28,
    paddingTop: 12,
    paddingBottom: 28,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 28,
  },
  logo: {
    width: 76,
    aspectRatio: LOGO_ASPECT_RATIO,
  },
  splashCover: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  splashCoverLogo: {
    width: SPLASH_LOGO_WIDTH,
    aspectRatio: LOGO_ASPECT_RATIO,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  backText: { fontSize: 13, fontWeight: "600", color: "#fff" },
  title: {
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.5,
    color: "#fff",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: "rgba(255,255,255,0.65)",
  },
  progressRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 20,
  },
  progressSegment: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  progressSegmentDone: { backgroundColor: "#fff" },
  eyebrow: {
    marginTop: 20,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 2,
    color: "rgba(255,255,255,0.5)",
  },
  sheet: {
    flex: 1,
    backgroundColor: "#fff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  sheetContent: {
    paddingHorizontal: 28,
    paddingTop: 32,
    paddingBottom: 40,
    gap: 20,
  },
  field: { gap: 8 },
  label: { fontSize: 13, fontWeight: "600", color: "#1A1A2E" },
  input: {
    height: 52,
    borderWidth: 1.5,
    borderColor: "#E4E5EC",
    borderRadius: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    color: "#1A1A2E",
    backgroundColor: "#F7F7FA",
  },
  inputFocused: {
    borderColor: "#1A1A2E",
    backgroundColor: "#fff",
  },
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    height: 52,
    borderWidth: 1.5,
    borderColor: "#E4E5EC",
    borderRadius: 14,
    backgroundColor: "#F7F7FA",
    paddingHorizontal: 16,
  },
  phonePrefix: { fontSize: 16, fontWeight: "600", color: "#1A1A2E" },
  phoneDivider: {
    width: 1,
    height: 22,
    backgroundColor: "#E4E5EC",
    marginHorizontal: 12,
  },
  phoneInput: {
    flex: 1,
    fontSize: 16,
    color: "#1A1A2E",
    height: "100%",
  },
  codeRow: {
    flexDirection: "row",
    gap: 8,
  },
  codeCell: {
    flex: 1,
    height: 56,
    borderWidth: 1.5,
    borderColor: "#E4E5EC",
    borderRadius: 14,
    backgroundColor: "#F7F7FA",
    alignItems: "center",
    justifyContent: "center",
  },
  codeCellFilled: {
    borderColor: "#1A1A2E",
    backgroundColor: "#fff",
  },
  codeCellActive: {
    borderColor: "#1A1A2E",
    backgroundColor: "#fff",
  },
  codeChar: { fontSize: 22, fontWeight: "700", color: "#1A1A2E" },
  codeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#1A1A2E",
  },
  codeHiddenInput: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0,
  },
  devHintChip: {
    alignSelf: "flex-start",
    backgroundColor: "#F2F4FD",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 4,
  },
  devHintText: { fontSize: 12, fontWeight: "500", color: "#3A3A55" },
  button: {
    height: 52,
    borderRadius: 14,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { fontSize: 16, fontWeight: "600", color: "#fff" },
  link: {
    textAlign: "center",
    color: "#666",
    fontSize: 14,
    marginTop: 4,
  },
  linkStrong: { color: "#1A1A2E", fontWeight: "700" },
  note: {
    fontSize: 12,
    color: "#B4B4BE",
    textAlign: "center",
    lineHeight: 18,
    marginTop: 8,
  },
});
