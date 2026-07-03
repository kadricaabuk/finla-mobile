import * as SecureStore from 'expo-secure-store'

const PREFIX = 'finla_auth'

const KEY_ACCESS = `${PREFIX}_access`
const KEY_REFRESH = `${PREFIX}_refresh`
const KEY_EXPIRES_AT = `${PREFIX}_expires_at`

export interface StoredTokens {
  accessToken: string
  refreshToken: string
  /** Unix epoch ms when access token should be considered expired (client hint; server is source of truth) */
  expiresAtMs: number
}

export async function saveTokens(tokens: StoredTokens): Promise<void> {
  await SecureStore.setItemAsync(KEY_ACCESS, tokens.accessToken)
  await SecureStore.setItemAsync(KEY_REFRESH, tokens.refreshToken)
  await SecureStore.setItemAsync(KEY_EXPIRES_AT, String(tokens.expiresAtMs))
}

export async function getTokens(): Promise<StoredTokens | null> {
  const accessToken = await SecureStore.getItemAsync(KEY_ACCESS)
  const refreshToken = await SecureStore.getItemAsync(KEY_REFRESH)
  const expiresRaw = await SecureStore.getItemAsync(KEY_EXPIRES_AT)
  if (!accessToken || !refreshToken) return null
  const expiresAtMs = expiresRaw ? Number(expiresRaw) : 0
  return {
    accessToken,
    refreshToken,
    expiresAtMs: Number.isFinite(expiresAtMs) ? expiresAtMs : 0,
  }
}

export async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_ACCESS)
  await SecureStore.deleteItemAsync(KEY_REFRESH)
  await SecureStore.deleteItemAsync(KEY_EXPIRES_AT)
}

/** Legacy credentials — cleared on next successful token login */
const LEGACY_KEY = 'gib_credentials'

export async function clearLegacyCredentials(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(LEGACY_KEY)
  } catch {
    // ignore
  }
}

/** Decode JWT payload without verification (display-only) */
export function decodeJwtSub(accessToken: string): string | null {
  const claims = decodeJwtClaims(accessToken)
  return claims?.phone ?? claims?.sub ?? null
}

export interface FinlaJwtClaims {
  sub?: string
  phone?: string
  tenant_vkn?: string
  tenant_name?: string
  onboarding_status?: string
}

export function decodeJwtClaims(accessToken: string): FinlaJwtClaims | null {
  try {
    const parts = accessToken.split('.')
    if (parts.length !== 3) return null
    let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const pad = payload.length % 4
    if (pad) payload += '='.repeat(4 - pad)
    const json = atob(payload)
    return JSON.parse(json) as FinlaJwtClaims
  } catch {
    return null
  }
}
