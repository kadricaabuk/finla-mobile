import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import {
  StyleSheet,
  TouchableOpacity,
  type TouchableOpacityProps,
} from "react-native";

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 } as const;

type IoniconsName = ComponentProps<typeof Ionicons>["name"];

interface IconHeaderButtonProps extends Omit<TouchableOpacityProps, "style"> {
  name: IoniconsName;
  size?: number;
  color?: string;
}

export function IconHeaderButton({
  name,
  size = 24,
  color = "#000",
  accessibilityLabel,
  ...rest
}: IconHeaderButtonProps) {
  return (
    <TouchableOpacity
      style={styles.btn}
      hitSlop={HIT_SLOP}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      {...rest}
    >
      <Ionicons name={name} size={size} color={color} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
});
