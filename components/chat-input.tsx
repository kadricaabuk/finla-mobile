import { useAnimatedChatInputPadding } from "@/hooks/use-keyboard";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { StyleSheet, TextInput, TouchableOpacity, View } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
  onAttach?: () => void;
  onVoice?: () => void;
}

export default function ChatInput({
  onSend,
  disabled = false,
  placeholder = "Finla'ya sor",
  onAttach,
  onVoice,
}: ChatInputProps) {
  const [text, setText] = useState("");
  const insets = useSafeAreaInsets();
  const animatedContainerStyle = useAnimatedChatInputPadding(insets.bottom);

  const handleSend = () => {
    if (disabled) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
  };

  const hasText = text.trim().length > 0;

  return (
    <Animated.View style={[styles.container, animatedContainerStyle]}>
      <View style={styles.row}>
        {/* {onAttach ? (
          <TouchableOpacity
            style={styles.circleBtn}
            onPress={onAttach}
            activeOpacity={0.7}
          >
            <Ionicons name="add" size={22} color="#000" />
          </TouchableOpacity>
        ) : (
          <View style={styles.circleBtnGhost} pointerEvents="none" />
        )} */}

        <TextInput
          testID="chat-input"
          accessibilityLabel="Finla'ya sor"
          style={[styles.input, disabled && styles.inputDisabled]}
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor="#ABABAB"
          multiline
          editable={!disabled}
          returnKeyType="default"
        />

        {hasText && (
          <TouchableOpacity
            testID="chat-send"
            accessibilityLabel="Gönder"
            style={[
              styles.circleBtn,
              styles.actionBtn,
              disabled && styles.actionBtnDisabled,
            ]}
            onPress={handleSend}
            activeOpacity={0.8}
            disabled={disabled}
          >
            <Ionicons name="arrow-up" size={20} color="#fff" />
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingTop: 8,
    backgroundColor: "#fff",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  circleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: "#E0E0E0",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  circleBtnGhost: {
    width: 44,
    height: 44,
  },
  actionBtn: {
    backgroundColor: "#000",
    borderColor: "#000",
  },
  actionBtnDisabled: {
    opacity: 0.45,
  },
  input: {
    flex: 1,
    backgroundColor: "#F2F2F2",
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 11,
    fontSize: 16,
    color: "#000",
    maxHeight: 120,
  },
  inputDisabled: {
    opacity: 0.65,
  },
});
