import { setOnboardingSeen } from "@/lib/onboarding-local";
import { getTokens } from "@/lib/session";
import { Image, type ImageSource } from "expo-image";
import { router } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type SlideFocus = "top" | "center";

type Slide = {
  id: string;
  image: ImageSource;
  title: string;
  subtitle: string;
  focus: SlideFocus;
};

const SLIDES: Slide[] = [
  {
    id: "chat",
    image: require("@/assets/images/onboarding/slide-chat.png"),
    title: "Konuşarak fatura kes",
    subtitle:
      "finla'ya yaz, gerisini o halletsin. Sohbet ederek e-fatura oluştur, önizle ve tek dokunuşla GİB'e gönder.",
    focus: "center",
  },
  {
    id: "outgoing",
    image: require("@/assets/images/onboarding/slide-outgoing.png"),
    title: "Faturalarını yönet",
    subtitle:
      "Giden faturalarını tek ekranda gör, filtrele ve durumlarını anlık takip et.",
    focus: "top",
  },
  {
    id: "incoming",
    image: require("@/assets/images/onboarding/slide-incoming.png"),
    title: "Gelen faturaları yanıtla",
    subtitle:
      "Sana gelen faturaları incele, kabul veya ret yanıtını anında ver.",
    focus: "top",
  },
];

const CIRCLE_SIZE = 300;
const PHONE_WIDTH = 200;
const PHONE_SCREEN_HEIGHT = 320;
const FRAME_BEZEL = 5;
const PHONE_TOP_OFFSET = 50;

function PhoneMockup({
  source,
  focus,
}: {
  source: ImageSource;
  focus: SlideFocus;
}) {
  return (
    <View style={styles.circle}>
      <View style={styles.phoneBezel}>
        <View style={styles.phoneScreen}>
          <Image
            source={source}
            style={styles.screenshot}
            contentFit="cover"
            contentPosition={focus === "center" ? "center" : "top"}
          />
        </View>
      </View>
    </View>
  );
}

export default function OnboardingScreen() {
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<Slide>>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  const isLastSlide = activeIndex === SLIDES.length - 1;

  const handleComplete = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      await setOnboardingSeen();
      const tokens = await getTokens();
      router.replace(tokens ? "/" : "/login");
    } finally {
      setLoading(false);
    }
  }, [loading]);

  const handleNext = useCallback(() => {
    if (isLastSlide) {
      void handleComplete();
      return;
    }
    listRef.current?.scrollToIndex({ index: activeIndex + 1, animated: true });
  }, [activeIndex, handleComplete, isLastSlide]);

  const onMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const index = Math.round(e.nativeEvent.contentOffset.x / width);
      setActiveIndex(index);
    },
    [width],
  );

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <FlatList
        ref={listRef}
        style={styles.list}
        data={SLIDES}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumScrollEnd}
        getItemLayout={(_, index) => ({
          length: width,
          offset: width * index,
          index,
        })}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            <View style={styles.visualArea}>
              <PhoneMockup source={item.image} focus={item.focus} />
            </View>
            <View style={styles.textArea}>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.subtitle}>{item.subtitle}</Text>
            </View>
          </View>
        )}
      />

      <View style={styles.footer}>
        <TouchableOpacity
          testID="onboarding-next"
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleNext}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>
              {isLastSlide ? "Başla" : "İleri"}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          testID="onboarding-skip"
          onPress={() => void handleComplete()}
          disabled={loading}
          hitSlop={12}
        >
          <Text style={[styles.skipText, loading && styles.skipDisabled]}>
            Atla
          </Text>
        </TouchableOpacity>

        <View style={styles.dots}>
          {SLIDES.map((slide, index) => (
            <View
              key={slide.id}
              style={[styles.dot, index === activeIndex && styles.dotActive]}
            />
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  list: {
    flex: 1,
  },
  slide: {
    flex: 1,
    paddingHorizontal: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  visualArea: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 36,
  },
  circle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    backgroundColor: "#F2F4FD",
    overflow: "hidden",
    alignItems: "center",
  },
  phoneBezel: {
    marginTop: PHONE_TOP_OFFSET,
    width: PHONE_WIDTH,
    backgroundColor: "#000",
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
    padding: FRAME_BEZEL,
  },
  phoneScreen: {
    width: PHONE_WIDTH - FRAME_BEZEL * 2,
    height: PHONE_SCREEN_HEIGHT,
    borderTopLeftRadius: 31,
    borderTopRightRadius: 31,
    overflow: "hidden",
    backgroundColor: "#fff",
  },
  screenshot: {
    width: "100%",
    height: "100%",
  },
  textArea: {
    alignItems: "center",
    gap: 10,
  },
  title: {
    fontSize: 25,
    fontWeight: "800",
    color: "#1A1A2E",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: "#666",
    lineHeight: 21,
    textAlign: "center",
    paddingHorizontal: 8,
  },
  footer: {
    paddingHorizontal: 28,
    paddingBottom: 12,
    paddingTop: 8,
    gap: 16,
    alignItems: "center",
  },
  button: {
    alignSelf: "stretch",
    marginHorizontal: 12,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
  skipText: {
    fontSize: 15,
    fontWeight: "500",
    color: "#666",
    textAlign: "center",
  },
  skipDisabled: {
    opacity: 0.5,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    paddingTop: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#E0E0E0",
  },
  dotActive: {
    backgroundColor: "#000",
    width: 20,
  },
});
