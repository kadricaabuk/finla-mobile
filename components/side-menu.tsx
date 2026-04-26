import { useEffect, useRef } from 'react'
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'

const MENU_WIDTH = 280

interface SideMenuProps {
  isOpen: boolean
  onClose: () => void
  onNewChat: () => void
  onLogout: () => void
  username: string
}

export default function SideMenu({
  isOpen,
  onClose,
  onNewChat,
  onLogout,
  username,
}: SideMenuProps) {
  const translateX = useRef(new Animated.Value(-MENU_WIDTH)).current
  const backdropOpacity = useRef(new Animated.Value(0)).current
  const insets = useSafeAreaInsets()

  useEffect(() => {
    if (isOpen) {
      Animated.parallel([
        Animated.spring(translateX, {
          toValue: 0,
          tension: 80,
          friction: 15,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0.45,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start()
    } else {
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: -MENU_WIDTH,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, translateX, backdropOpacity])

  return (
    <View
      style={StyleSheet.absoluteFillObject}
      pointerEvents={isOpen ? 'auto' : 'none'}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />
      </TouchableWithoutFeedback>

      <Animated.View
        style={[
          styles.panel,
          { transform: [{ translateX }], paddingTop: insets.top },
        ]}
      >
        <View style={styles.panelHeader}>
          <Text style={styles.logo}>finla</Text>
          <TouchableOpacity style={styles.iconBtn} onPress={onClose}>
            <Ionicons name="create-outline" size={22} color="#000" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.newChatBtn}
          onPress={onNewChat}
          activeOpacity={0.7}
        >
          <View style={styles.newChatLeft}>
            <Ionicons name="chatbubble-outline" size={18} color="#000" />
            <Text style={styles.newChatLabel}>Yeni Sohbet</Text>
          </View>
          <Ionicons name="add" size={20} color="#555" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navBtn}
          onPress={() => { onClose(); router.push('/invoices') }}
          activeOpacity={0.7}
        >
          <Ionicons name="document-text-outline" size={18} color="#000" />
          <Text style={styles.navBtnLabel}>Faturalarım</Text>
          <Ionicons name="chevron-forward" size={16} color="#ABABAB" style={styles.navChevron} />
        </TouchableOpacity>

        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
          <Text style={styles.sectionLabel}>Hakkında</Text>
          <View style={styles.infoCard}>
            <Text style={styles.infoText}>
              Finla, GİB e-Arşiv portalı üzerinden fatura oluşturmanıza ve yönetmenize yardımcı olur.
            </Text>
            <Text style={[styles.infoText, { marginTop: 8 }]}>
              {'Örnek komutlar:\n'}
              {'• "Ahmet Bey\'e 5000 TL danışmanlık faturası"\n'}
              {'• "Bu ayki faturaları listele"\n'}
              {'• "Son faturayı iptal et"'}
            </Text>
          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.profileRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarInitial}>
                {username.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName} numberOfLines={1}>
                {username}
              </Text>
              <Text style={styles.profileSub}>GİB Hesabı</Text>
            </View>
            <TouchableOpacity style={styles.logoutBtn} onPress={onLogout}>
              <Ionicons name="log-out-outline" size={20} color="#888" />
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  panel: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: MENU_WIDTH,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 20,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  logo: {
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: -0.5,
    color: '#000',
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newChatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 10,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: '#F5F5F5',
  },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 10,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 10,
    gap: 8,
  },
  navBtnLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#000',
  },
  navChevron: {
    marginLeft: 'auto',
  },
  newChatLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  newChatLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: '#000',
  },
  list: {
    flex: 1,
    paddingHorizontal: 10,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#ABABAB',
    letterSpacing: 0.4,
    paddingHorizontal: 8,
    paddingTop: 12,
    paddingBottom: 8,
    textTransform: 'uppercase',
  },
  infoCard: {
    backgroundColor: '#F8F8F8',
    borderRadius: 10,
    padding: 12,
    marginHorizontal: 2,
  },
  infoText: {
    fontSize: 13,
    color: '#555',
    lineHeight: 19,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E8E8E8',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  profileSub: {
    fontSize: 11,
    color: '#ABABAB',
    marginTop: 1,
  },
  logoutBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
