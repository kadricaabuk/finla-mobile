import { colors, radius, spacing, typeScale } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  type StyleProp,
  type ViewStyle,
} from "react-native";

type IoniconsName = ComponentProps<typeof Ionicons>["name"];

interface ButtonProps {
  label: string;
  onPress: () => void;
  /** filled: primary (black fill), outline: secondary (bordered). */
  variant?: "filled" | "outline";
  icon?: IoniconsName;
  loading?: boolean;
  disabled?: boolean;
  /** Shorter button for in-card actions. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
}

export function Button({
  label,
  onPress,
  variant = "filled",
  icon,
  loading = false,
  disabled = false,
  compact = false,
  style,
  testID,
  accessibilityLabel,
}: ButtonProps) {
  const filled = variant === "filled";
  const contentColor = filled ? colors.background : colors.ink;
  return (
    <TouchableOpacity
      testID={testID}
      style={[
        styles.base,
        compact ? styles.compact : styles.regular,
        filled ? styles.filled : styles.outline,
        disabled && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
    >
      {loading ? (
        <ActivityIndicator size="small" color={contentColor} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={18} color={contentColor} /> : null}
          <Text
            style={[
              compact ? styles.labelCompact : styles.label,
              { color: contentColor },
            ]}
            numberOfLines={1}
          >
            {label}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
  },
  regular: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    minHeight: 48,
  },
  compact: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  filled: {
    backgroundColor: colors.ink,
  },
  outline: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    fontSize: typeScale.body,
    fontWeight: "600",
  },
  labelCompact: {
    fontSize: typeScale.label,
    fontWeight: "600",
  },
});
