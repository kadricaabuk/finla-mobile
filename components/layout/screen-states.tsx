import { Button } from "@/components/layout/button";
import { colors, spacing, typeScale } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { StyleSheet, Text, View } from "react-native";

type IoniconsName = ComponentProps<typeof Ionicons>["name"];

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <View style={styles.center}>
      <Ionicons name="alert-circle-outline" size={40} color={colors.danger} />
      <Text style={styles.errorText}>{message}</Text>
      <Button label="Tekrar Dene" onPress={onRetry} compact />
    </View>
  );
}

export function EmptyState({
  icon = "document-outline",
  message,
  actionLabel,
  onAction,
}: {
  icon?: IoniconsName;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.center}>
      <Ionicons name={icon} size={48} color={colors.border} />
      <Text style={styles.emptyText}>{message}</Text>
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} compact />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    paddingBottom: 80,
    paddingHorizontal: 32,
  },
  errorText: {
    fontSize: typeScale.label,
    color: colors.danger,
    textAlign: "center",
  },
  emptyText: {
    fontSize: typeScale.label,
    color: colors.faint,
    textAlign: "center",
  },
});
