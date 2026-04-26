import * as SecureStore from 'expo-secure-store'

const KEY = 'gib_credentials'

export interface GIBCredentials {
  username: string
  password: string
}

export async function saveCredentials(creds: GIBCredentials): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(creds))
}

export async function getCredentials(): Promise<GIBCredentials | null> {
  const raw = await SecureStore.getItemAsync(KEY)
  if (!raw) return null
  return JSON.parse(raw) as GIBCredentials
}

export async function clearCredentials(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY)
}
