import { useEffect, useRef } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  type StyleProp,
  type TextStyle,
} from "react-native";

/**
 * Soft "breathing" opacity on status copy while the model is thinking.
 * Period ~1.8s (900ms each way), opacity 100% ↔ ~55%. Honors Reduce Motion.
 */
function useBreathingOpacity(): Animated.Value {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled || reduced) return;
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 0.55,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 1,
            duration: 900,
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

interface PulsingStatusTextProps {
  children: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}

/** Status label with a gentle opacity pulse — no spinner, no shimmer. */
export function PulsingStatusText({
  children,
  style,
  numberOfLines,
}: PulsingStatusTextProps) {
  const opacity = useBreathingOpacity();
  return (
    <Animated.Text
      style={[styles.text, style, { opacity }]}
      numberOfLines={numberOfLines}
    >
      {children}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  text: {
    flexShrink: 1,
    fontSize: 15,
    lineHeight: 22,
    color: "#555",
  },
});
