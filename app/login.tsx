import { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { callEdgeFunction } from '@/lib/supabase'
import { saveCredentials } from '@/lib/session'

export default function LoginScreen() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    const u = username.trim()
    const p = password.trim()

    if (!u || !p) {
      Alert.alert('Hata', 'Kullanıcı adı ve şifre gereklidir.')
      return
    }

    setLoading(true)
    try {
      const res = await callEdgeFunction<{ success: boolean; error?: string }>(
        'login',
        { username: u, password: p },
      )

      if (!res.success) {
        Alert.alert('Giriş Başarısız', res.error ?? 'Bilgilerinizi kontrol edin.')
        return
      }

      await saveCredentials({ username: u, password: p })
      router.replace('/')
    } catch (err) {
      Alert.alert(
        'Bağlantı Hatası',
        err instanceof Error ? err.message : 'Sunucuya ulaşılamadı.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.inner}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Text style={styles.logo}>finla</Text>
          <Text style={styles.subtitle}>GİB e-Arşiv Portalı ile giriş yap</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.field}>
            <Text style={styles.label}>TC Kimlik No / Vergi Kimlik No</Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              placeholder="TC veya Vergi Kimlik Numaranız"
              placeholderTextColor="#ABABAB"
              keyboardType="numeric"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Şifre</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="GİB portal şifreniz"
              placeholderTextColor="#ABABAB"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleLogin}
            />
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Giriş Yap</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.note}>
          Bu uygulama GİB e-Arşiv portalındaki bilgilerinizi kullanır.
          Bilgileriniz yalnızca cihazınızda şifreli olarak saklanır.
        </Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  inner: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: 'center',
  },
  header: {
    marginBottom: 48,
  },
  logo: {
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: -1,
    color: '#000',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    lineHeight: 22,
  },
  form: {
    gap: 16,
    marginBottom: 32,
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: '#444',
    letterSpacing: 0.1,
  },
  input: {
    height: 50,
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#000',
    backgroundColor: '#FAFAFA',
  },
  button: {
    height: 52,
    borderRadius: 12,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  note: {
    fontSize: 12,
    color: '#ABABAB',
    textAlign: 'center',
    lineHeight: 18,
  },
})
