import { useAnimatedChatInputPadding } from "@/hooks/use-keyboard";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface ChatInputProps {
  onSend: (text: string) => void | Promise<void>;
  disabled?: boolean;
  /** Yanıt akarken gönder butonu durdur butonuna dönüşür. */
  streaming?: boolean;
  onStop?: () => void;
  onFocusChange?: (focused: boolean) => void;
  placeholder?: string;
  onAttach?: () => void;
  onVoice?: () => void;
  /** Dışarıdan gelen taslak metin: input'a bir kez yazılır, kullanıcı düzenleyebilir. */
  draftText?: string | null;
  /** Taslak input'a uygulandığında çağrılır — parent taslağı temizlemeli. */
  onDraftConsumed?: () => void;
  /** True while editing a sent message — shows a cancelable banner. */
  editing?: boolean;
  /** Called when the user dismisses edit mode; the input is cleared. */
  onCancelEdit?: () => void;
}

export default function ChatInput({
  onSend,
  disabled = false,
  streaming = false,
  onStop,
  onFocusChange,
  placeholder = "finla'ya yaz",
  onAttach,
  onVoice,
  draftText = null,
  onDraftConsumed,
  editing = false,
  onCancelEdit,
}: ChatInputProps) {
  const [text, setText] = useState("");
  const inputRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();
  const animatedContainerStyle = useAnimatedChatInputPadding(insets.bottom);

  useEffect(() => {
    if (!draftText) return;
    setText(draftText);
    inputRef.current?.focus();
    onDraftConsumed?.();
  }, [draftText, onDraftConsumed]);

  const handleSend = async () => {
    if (disabled) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    try {
      await onSend(trimmed);
      setText("");
    } catch {
      /* parent hata gösterir; metin input'ta kalır */
    }
  };

  const hasText = text.trim().length > 0;

  const handleCancelEdit = () => {
    setText("");
    onCancelEdit?.();
  };

  return (
    <Animated.View style={[styles.container, animatedContainerStyle]}>
      {editing ? (
        <View style={styles.editBanner}>
          <Ionicons name="pencil" size={14} color="#555" />
          <Text style={styles.editBannerText} numberOfLines={1}>
            Mesajı düzenliyorsun
          </Text>
          <TouchableOpacity
            testID="chat-cancel-edit"
            accessibilityLabel="Düzenlemeyi iptal et"
            style={styles.editBannerClose}
            onPress={handleCancelEdit}
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={16} color="#555" />
          </TouchableOpacity>
        </View>
      ) : null}
      <View style={styles.row}>
        {onAttach ? (
          <TouchableOpacity
            style={styles.circleBtn}
            onPress={onAttach}
            activeOpacity={0.7}
          >
            <Ionicons name="add" size={22} color="#000" />
          </TouchableOpacity>
        ) : null}

        <TextInput
          ref={inputRef}
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
          onFocus={() => onFocusChange?.(true)}
          onBlur={() => onFocusChange?.(false)}
        />

        {streaming && onStop ? (
          <TouchableOpacity
            testID="chat-stop"
            accessibilityLabel="Yanıtı durdur"
            style={[styles.circleBtn, styles.actionBtn]}
            onPress={onStop}
            activeOpacity={0.8}
          >
            <Ionicons name="stop" size={16} color="#fff" />
          </TouchableOpacity>
        ) : hasText ? (
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
        ) : null}
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
    backgroundColor: "#F3F4F9",
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 11,
    fontSize: 16,
    color: "#000",
    maxHeight: 120,
    minHeight: 44,
  },
  inputDisabled: {
    opacity: 0.65,
  },
  editBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: "#F3F4F9",
  },
  editBannerText: {
    flex: 1,
    fontSize: 13,
    color: "#555",
    fontWeight: "500",
  },
  editBannerClose: {
    padding: 2,
  },
});
