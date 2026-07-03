import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export function SessionBootstrapPlaceholder() {
  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.center}>
        <Text style={styles.wordmark}>finla</Text>
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color="#000" />
          <Text style={styles.loadingText}>Yükleniyor...</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  wordmark: {
    fontSize: 40,
    fontWeight: "700",
    letterSpacing: -1,
    color: "#000",
    marginBottom: 28,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  loadingText: {
    fontSize: 15,
    color: "#666",
  },
});
