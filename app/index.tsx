import ChatInput from "@/components/chat-input";
import SideMenu from "@/components/side-menu";
import {
  clearCredentials,
  getCredentials,
  type GIBCredentials,
} from "@/lib/session";
import { callEdgeFunction } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface Message {
  id: string;
  text: string;
  role: "user" | "assistant";
}

export default function ChatScreen() {
  const [credentials, setCredentials] = useState<GIBCredentials | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    getCredentials().then((creds) => {
      if (!creds) {
        router.replace("/login");
        return;
      }
      setCredentials(creds);
    });
  }, []);

  const scrollToBottom = () =>
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);

  const handleSend = useCallback(
    async (text: string) => {
      if (!credentials) return;

      const userMsg: Message = {
        id: Date.now().toString(),
        text,
        role: "user",
      };
      setMessages((prev) => [...prev, userMsg]);
      setLoading(true);
      scrollToBottom();

      try {
        const res = await callEdgeFunction<{
          message: string;
          conversationId: string;
        }>("chat", {
          message: text,
          conversationId,
          username: credentials.username,
          password: credentials.password,
        });

        console.log("res", res);

        if (!conversationId) setConversationId(res.conversationId);

        const aiMsg: Message = {
          id: (Date.now() + 1).toString(),
          text: res.message,
          role: "assistant",
        };
        setMessages((prev) => [...prev, aiMsg]);
      } catch (err) {
        const errMsg: Message = {
          id: (Date.now() + 1).toString(),
          text: `Hata: ${err instanceof Error ? err.message : "Beklenmeyen bir sorun oluştu."}`,
          role: "assistant",
        };
        setMessages((prev) => [...prev, errMsg]);
      } finally {
        setLoading(false);
        scrollToBottom();
      }
    },
    [credentials, conversationId],
  );

  const handleNewChat = () => {
    setMessages([]);
    setConversationId(null);
    setIsMenuOpen(false);
  };

  const handleLogout = async () => {
    try {
      if (credentials) {
        await callEdgeFunction("logout", { username: credentials.username });
      }
    } catch {
      // Non-critical — proceed with local logout regardless
    }
    await clearCredentials();
    router.replace("/login");
  };

  if (!credentials) return null;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => setIsMenuOpen(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="menu" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.title}>finla</Text>
        <View style={styles.headerBtn} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.messagesContent}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
        >
          {messages.map((msg) => (
            <View
              key={msg.id}
              style={[
                styles.bubble,
                msg.role === "user" ? styles.userBubble : styles.aiBubble,
              ]}
            >
              <Text
                style={[
                  styles.bubbleText,
                  msg.role === "user" ? styles.userText : styles.aiText,
                ]}
              >
                {msg.text}
              </Text>
            </View>
          ))}

          {loading && (
            <View
              style={[styles.bubble, styles.aiBubble, styles.loadingBubble]}
            >
              <ActivityIndicator size="small" color="#888" />
            </View>
          )}
        </ScrollView>

        <ChatInput onSend={handleSend} />
      </KeyboardAvoidingView>

      <SideMenu
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        onNewChat={handleNewChat}
        onLogout={handleLogout}
        username={credentials.username}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "600",
    letterSpacing: -0.5,
    color: "#000",
  },
  messagesContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  bubble: {
    maxWidth: "80%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
  },
  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: "#000",
  },
  aiBubble: {
    alignSelf: "flex-start",
    backgroundColor: "#F2F2F2",
  },
  loadingBubble: {
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 22,
  },
  userText: {
    color: "#fff",
  },
  aiText: {
    color: "#000",
  },
});
