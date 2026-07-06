import AsyncStorage from '@react-native-async-storage/async-storage'

const KEY = 'finla_onboarding_seen'

/** Whether the intro carousel has been shown on this install/device. */
export async function getOnboardingSeen(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY)) === '1'
  } catch {
    return false
  }
}

export async function setOnboardingSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, '1')
  } catch {
    // Non-fatal: worst case the carousel shows again next cold start.
  }
}
