import { injectHtmlViewport } from "@/lib/inject-html-viewport";
import type { ChatMessageAction } from "@/types/chat-actions";
import { Ionicons } from "@expo/vector-icons";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import WebView from "react-native-webview";

interface InvoicePreviewModalProps {
  action: ChatMessageAction | null;
  onClose: () => void;
}

export function InvoicePreviewModal({
  action,
  onClose,
}: InvoicePreviewModalProps) {
  const html = action?.preview?.html;
  const visible = !!html;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.previewScreen} edges={["top", "bottom"]}>
        <View style={styles.previewHeader}>
          <Text style={styles.previewHeaderTitle} numberOfLines={1}>
            {action?.preview?.title || "Fatura Önizleme"}
          </Text>
          <View style={styles.previewHeaderButtons}>
            <TouchableOpacity
              style={styles.previewHeaderBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={async () => {
                if (!html) return;
                const { uri } = await Print.printToFileAsync({
                  html,
                  base64: false,
                });
                const canShare = await Sharing.isAvailableAsync();
                if (canShare) {
                  await Sharing.shareAsync(uri, {
                    mimeType: "application/pdf",
                    dialogTitle: "Fatura PDF",
                    UTI: "com.adobe.pdf",
                  });
                }
              }}
            >
              <Ionicons name="share-outline" size={22} color="#000" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.previewHeaderBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={onClose}
            >
              <Ionicons name="close" size={24} color="#000" />
            </TouchableOpacity>
          </View>
        </View>
        <WebView
          source={{ html: injectHtmlViewport(html ?? "") }}
          style={styles.previewWebView}
          originWhitelist={["*"]}
          javaScriptEnabled={false}
          scrollEnabled
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  previewScreen: {
    flex: 1,
    backgroundColor: "#fff",
  },
  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#DCDCDC",
    backgroundColor: "#fff",
  },
  previewHeaderTitle: {
    flex: 1,
    marginRight: 12,
    fontSize: 17,
    fontWeight: "600",
    color: "#000",
  },
  previewHeaderButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  previewHeaderBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  previewWebView: {
    flex: 1,
    backgroundColor: "#fff",
  },
});
