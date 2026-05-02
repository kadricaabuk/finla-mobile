import { useEffect, type RefObject } from "react";
import { Keyboard, Platform, type ScrollView } from "react-native";

export function useScrollToEndOnKeyboard(
  scrollRef: RefObject<ScrollView | null>,
) {
  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    let settleTimeout: ReturnType<typeof setTimeout> | undefined;
    const sub = Keyboard.addListener(
      showEvent,
      (e: { duration?: number }) => {
        scrollRef.current?.scrollToEnd({ animated: true });
        if (settleTimeout) clearTimeout(settleTimeout);
        const settleMs =
          Platform.OS === "ios"
            ? Math.min(Math.max(e.duration ?? 250, 32), 520) + 48
            : 150;
        settleTimeout = setTimeout(
          () => scrollRef.current?.scrollToEnd({ animated: true }),
          settleMs,
        );
      },
    );
    return () => {
      sub.remove();
      if (settleTimeout) clearTimeout(settleTimeout);
    };
  }, [scrollRef]);
}
