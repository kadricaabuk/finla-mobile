import { useState } from 'react';
import {
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

interface ChatInputProps {
  onSend: (text: string) => void;
  onAttach?: () => void;
  onVoice?: () => void;
}

export default function ChatInput({ onSend, onAttach, onVoice }: ChatInputProps) {
  const [text, setText] = useState('');
  const insets = useSafeAreaInsets();

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  };

  const hasText = text.trim().length > 0;

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + 8 }]}>
      <View style={styles.row}>
        <TouchableOpacity style={styles.circleBtn} onPress={onAttach} activeOpacity={0.7}>
          <Ionicons name="add" size={22} color="#000" />
        </TouchableOpacity>

        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Finla'ya sor"
          placeholderTextColor="#ABABAB"
          multiline
          returnKeyType="default"
        />

        <TouchableOpacity
          style={[styles.circleBtn, styles.actionBtn]}
          onPress={hasText ? handleSend : onVoice}
          activeOpacity={0.8}
        >
          {hasText ? (
            <Ionicons name="arrow-up" size={20} color="#fff" />
          ) : (
            <MaterialCommunityIcons name="waveform" size={22} color="#fff" />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingTop: 8,
    backgroundColor: '#fff',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  circleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  actionBtn: {
    backgroundColor: '#000',
    borderColor: '#000',
  },
  input: {
    flex: 1,
    backgroundColor: '#F2F2F2',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 11,
    fontSize: 16,
    color: '#000',
    maxHeight: 120,
  },
});
