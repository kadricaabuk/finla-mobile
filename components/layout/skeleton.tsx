import { colors } from "@/constants/theme";
import { useEffect, useRef } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  type StyleProp,
  type ViewStyle,
} from "react-native";

/** Slow breathing loop; stays static when Reduce Motion is enabled. */
function usePulseOpacity(): Animated.Value {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled || reduced) return;
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 0.45,
            duration: 700,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 1,
            duration: 700,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
      loop.start();
    });
    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [opacity]);

  return opacity;
}

/** The single building block of skeleton screens: a pulsing gray bar. */
export function SkeletonBar({ style }: { style?: StyleProp<ViewStyle> }) {
  const opacity = usePulseOpacity();
  return (
    <Animated.View
      style={[{ backgroundColor: colors.pressed, borderRadius: 6, opacity }, style]}
    />
  );
}
