import type { ChatMessageAction } from "@/types/chat-actions";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

interface SignOtpModalProps {
  action: ChatMessageAction | null;
  signOtpCode: string;
  signOtpPhone: string;
  verifyingSignOtp: boolean;
  requestingSignOtp: boolean;
  onChangeCode: (v: string) => void;
  onChangePhone: (v: string) => void;
  onVerify: () => void;
  onResend: () => void;
  onUpdatePhoneAndSend: () => void;
  onDismiss: () => void;
}

export function SignOtpModal({
  action,
  signOtpCode,
  signOtpPhone,
  verifyingSignOtp,
  requestingSignOtp,
  onChangeCode,
  onChangePhone,
  onVerify,
  onResend,
  onUpdatePhoneAndSend,
  onDismiss,
}: SignOtpModalProps) {
  const visible = !!action?.sign_otp?.draftUuid;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (verifyingSignOtp || requestingSignOtp) return;
        onDismiss();
      }}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>SMS Doğrulama</Text>
          <Text style={styles.modalLine}>
            İmzalama için SMS doğrulama bekleniyor.
          </Text>
          <Text style={styles.modalLine}>
            Kod gönderilen numara:{" "}
            {action?.sign_otp?.phoneMasked || "Kayıtlı numara"}
          </Text>
          <TextInput
            style={styles.otpInput}
            value={signOtpPhone}
            onChangeText={onChangePhone}
            keyboardType="phone-pad"
            placeholder="Numara değiştir (opsiyonel)"
            placeholderTextColor="#ABABAB"
            editable={!verifyingSignOtp && !requestingSignOtp}
          />
          <TextInput
            style={styles.otpInput}
            value={signOtpCode}
            onChangeText={onChangeCode}
            keyboardType="number-pad"
            placeholder="SMS kodu"
            placeholderTextColor="#ABABAB"
            editable={!verifyingSignOtp && !requestingSignOtp}
            returnKeyType="done"
            onSubmitEditing={onVerify}
          />
          <View style={styles.actionRow}>
            <Pressable
              style={[
                styles.modalSecondaryBtn,
                requestingSignOtp && styles.actionConfirmButtonDisabled,
              ]}
              onPress={onResend}
              disabled={requestingSignOtp || verifyingSignOtp}
            >
              <Text style={styles.modalSecondaryBtnText}>
                {requestingSignOtp ? "Gönderiliyor..." : "Kodu Yeniden Gönder"}
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.modalSecondaryBtn,
                requestingSignOtp && styles.actionConfirmButtonDisabled,
              ]}
              onPress={onUpdatePhoneAndSend}
              disabled={
                requestingSignOtp || verifyingSignOtp || !signOtpPhone.trim()
              }
            >
              <Text style={styles.modalSecondaryBtnText}>
                Numarayı Güncelle ve Gönder
              </Text>
            </Pressable>
          </View>
          <Pressable
            style={[
              styles.modalCloseBtn,
              (verifyingSignOtp || requestingSignOtp) &&
                styles.actionConfirmButtonDisabled,
            ]}
            onPress={onVerify}
            disabled={
              verifyingSignOtp || requestingSignOtp || !signOtpCode.trim()
            }
          >
            <Text style={styles.modalCloseBtnText}>
              {verifyingSignOtp ? "Doğrulanıyor..." : "Kodu Doğrula"}
            </Text>
          </Pressable>
          <Pressable
            style={styles.modalSecondaryBtn}
            onPress={() => {
              if (verifyingSignOtp || requestingSignOtp) return;
              onDismiss();
            }}
          >
            <Text style={styles.modalSecondaryBtnText}>Kapat</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  modalCard: {
    width: "100%",
    borderRadius: 14,
    backgroundColor: "#fff",
    padding: 16,
    gap: 8,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#000",
    marginBottom: 4,
  },
  modalLine: {
    fontSize: 14,
    color: "#111",
    lineHeight: 20,
  },
  otpInput: {
    height: 46,
    borderWidth: 1.2,
    borderColor: "#DCDCDC",
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    color: "#000",
    backgroundColor: "#FAFAFA",
    marginTop: 8,
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 4,
    justifyContent: "flex-end",
  },
  modalCloseBtn: {
    alignSelf: "flex-end",
    backgroundColor: "#000",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    marginTop: 4,
  },
  modalCloseBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  modalSecondaryBtn: {
    alignSelf: "flex-end",
    backgroundColor: "#EEE",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  modalSecondaryBtnText: {
    color: "#333",
    fontSize: 13,
    fontWeight: "600",
  },
  actionConfirmButtonDisabled: {
    opacity: 0.6,
  },
});
