import { useEffect, useRef } from "react";
import {
  Dimensions,
  Keyboard,
  type KeyboardEvent,
  Platform,
} from "react-native";
import {
  Easing,
  useAnimatedKeyboard,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const KEYBOARD_PADDING_OPEN = 12;

const IS_ANDROID = Platform.OS === "android";

/**
 * Android edge-to-edge'de (SDK 54'te zorunlu) adjustResize çalışmaz ve
 * keyboardDidShow güvenilir değildir; klavye yüksekliğini UI thread'de
 * kare kare veren useAnimatedKeyboard kullanılır. Bayraklar edge-to-edge
 * için gerekli, yoksa yükseklik status/navigation bar kadar kayar.
 */
const ANDROID_KEYBOARD_OPTIONS = {
  isStatusBarTranslucentAndroid: true,
  isNavigationBarTranslucentAndroid: true,
} as const;

function mapKeyboardEasing(easing?: string) {
  switch (easing) {
    case "easeIn":
      return Easing.in(Easing.ease);
    case "easeOut":
      return Easing.out(Easing.ease);
    case "easeInEaseOut":
      return Easing.inOut(Easing.ease);
    case "linear":
      return Easing.linear;
    case "keyboard":
      return Easing.bezier(0.165, 0.84, 0.44, 1);
    default:
      return Easing.out(Easing.cubic);
  }
}

function timingDuration(e: KeyboardEvent, fallbackMs: number) {
  if (Platform.OS === "ios") {
    const ms = typeof e.duration === "number" ? e.duration : 0;
    return ms >= 10 ? ms : fallbackMs;
  }
  const ms =
    typeof e.duration === "number" && e.duration > 15 ? e.duration : fallbackMs;
  return ms;
}

/** Docked klavyenin kapladığı alt inset (tek kaynak). */
function keyboardOverlapBottom(e: KeyboardEvent): number {
  const { screenY, height } = e.endCoordinates;
  const windowH = Dimensions.get("window").height;
  const screenH = Dimensions.get("screen").height;
  const byHeight = typeof height === "number" && height > 0 ? height : 0;
  const fromWin =
    typeof screenY === "number" && screenY >= 1
      ? Math.max(0, windowH - screenY)
      : 0;
  const fromScr =
    typeof screenY === "number" && screenY >= 1
      ? Math.max(0, screenH - screenY)
      : 0;
  const byY =
    fromWin > 120 && fromScr > 120
      ? Math.min(fromWin, fromScr)
      : Math.max(fromWin, fromScr);
  const inset =
    byHeight > 0 && byY > 0 ? Math.min(byHeight, byY) : Math.max(byHeight, byY);
  return Math.min(Math.max(inset, 0), windowH * 0.92);
}

/**
 * Klavyeden kaçmak için tek bir padding kaynağı (KeyboardAvoidingView yerine flex sütunun altına).
 */
export function useKeyboardAvoidancePadding() {
  const pad = useSharedValue(0);
  const keyboard = useAnimatedKeyboard(ANDROID_KEYBOARD_OPTIONS);

  useEffect(() => {
    if (IS_ANDROID) return;

    const showEvent = "keyboardWillShow";
    const hideEvent = "keyboardWillHide";

    const onShow = (evt: KeyboardEvent) => {
      const h = keyboardOverlapBottom(evt);
      pad.value = withTiming(h, {
        duration: timingDuration(evt, 250),
        easing: mapKeyboardEasing(evt.easing),
      });
    };

    const onHide = (evt: KeyboardEvent) => {
      pad.value = withTiming(0, {
        duration: timingDuration(evt, 220),
        easing: mapKeyboardEasing(evt.easing),
      });
    };

    const subShow = Keyboard.addListener(showEvent, onShow);
    const subHide = Keyboard.addListener(hideEvent, onHide);

    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, [pad]);

  return useAnimatedStyle(() => ({
    paddingBottom: IS_ANDROID ? keyboard.height.value : pad.value,
  }));
}

/**
 * Bottom padding animated in lockstep with the OS keyboard curve (keyboardWillShow/WillHide on iOS).
 * Fixes (1) stray home-indicator padding above the keyboard when it is open,
 * (2) instant padding jumps that fight KeyboardAvoidingView.
 */
export function useAnimatedChatInputPadding(
  safeBottom: number,
  openPadding: number = KEYBOARD_PADDING_OPEN,
) {
  const paddingBottom = useSharedValue(safeBottom);
  const keyboardOpenRef = useRef(false);
  const keyboard = useAnimatedKeyboard(ANDROID_KEYBOARD_OPTIONS);

  useEffect(() => {
    if (!keyboardOpenRef.current) {
      paddingBottom.value = safeBottom;
    }
  }, [paddingBottom, safeBottom]);

  useEffect(() => {
    if (IS_ANDROID) return;

    const showEvent = "keyboardWillShow";
    const hideEvent = "keyboardWillHide";

    const onShow = (e: KeyboardEvent) => {
      keyboardOpenRef.current = true;
      paddingBottom.value = withTiming(openPadding, {
        duration: timingDuration(e, 250),
        easing: mapKeyboardEasing(e.easing),
      });
    };

    const onHide = (e: KeyboardEvent) => {
      keyboardOpenRef.current = false;
      paddingBottom.value = withTiming(safeBottom, {
        duration: timingDuration(e, 220),
        easing: mapKeyboardEasing(e.easing),
      });
    };

    const subShow = Keyboard.addListener(showEvent, onShow);
    const subHide = Keyboard.addListener(hideEvent, onHide);

    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, [openPadding, paddingBottom, safeBottom]);

  return useAnimatedStyle(() => {
    if (IS_ANDROID) {
      const kb = keyboard.height.value;
      return {
        paddingBottom:
          kb <= 0 ? safeBottom : Math.max(openPadding, safeBottom - kb),
      };
    }
    return { paddingBottom: paddingBottom.value };
  });
}
