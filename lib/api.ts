import {
  clearTokens,
  getTokens,
  saveTokens,
  type StoredTokens,
} from '@/lib/session'

const API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL ?? '').replace(/\/$/, '')
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ''

function assertConfig(): void {
  if (!API_BASE_URL || !ANON_KEY) {
    throw new Error(
      'EXPO_PUBLIC_API_BASE_URL ve EXPO_PUBLIC_SUPABASE_ANON_KEY .env içinde tanımlı olmalıdır.',
    )
  }
  if (!ANON_KEY.startsWith('eyJ')) {
    throw new Error('EXPO_PUBLIC_SUPABASE_ANON_KEY geçersiz görünüyor (JWT formatı bekleniyor).')
  }
}

function authHeaders(accessToken: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    apikey: ANON_KEY,
    // Supabase gateway must receive a Supabase JWT here (anon key).
    // App-level access token is sent in a dedicated header.
    Authorization: `Bearer ${ANON_KEY}`,
    'x-finla-access-token': accessToken,
  }
}

function publicHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    apikey: ANON_KEY,
    Authorization: `Bearer ${ANON_KEY}`,
  }
}

async function parseJsonOrThrow(res: Response): Promise<unknown> {
  const text = await res.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = { raw: text }
  }
  if (!res.ok) {
    const obj = body as Record<string, unknown>
    const msg =
      (typeof obj?.error === 'string' && obj.error) ||
      (typeof obj?.message === 'string' && obj.message) ||
      `HTTP ${res.status}`
    throw new Error(msg)
  }
  return body
}

let refreshPromise: Promise<StoredTokens> | null = null

async function performRefresh(refreshToken: string): Promise<StoredTokens> {
  assertConfig()
  const res = await fetch(`${API_BASE_URL}/refresh`, {
    method: 'POST',
    headers: publicHeaders(),
    body: JSON.stringify({ refreshToken }),
  })
  const body = (await parseJsonOrThrow(res)) as {
    success?: boolean
    accessToken?: string
    refreshToken?: string
    expiresIn?: number
    error?: string
  }
  if (body.success === false || !body.accessToken || !body.refreshToken) {
    throw new Error(body.error ?? 'Token yenileme başarısız.')
  }
  const expiresIn = typeof body.expiresIn === 'number' ? body.expiresIn : 900
  const tokens: StoredTokens = {
    accessToken: body.accessToken,
    refreshToken: body.refreshToken,
    expiresAtMs: Date.now() + expiresIn * 1000,
  }
  await saveTokens(tokens)
  return tokens
}

async function refreshTokensLocked(): Promise<StoredTokens | null> {
  const current = await getTokens()
  if (!current?.refreshToken) return null

  if (!refreshPromise) {
    refreshPromise = performRefresh(current.refreshToken).finally(() => {
      refreshPromise = null
    })
  }
  try {
    return await refreshPromise
  } catch {
    await clearTokens()
    return null
  }
}

export interface LoginResponse {
  success: boolean
  error?: string
  error_code?: 'MULTI_SESSION_PERSISTED' | 'BAD_CREDENTIALS' | 'GIB_TEMPORARY' | 'UNKNOWN'
  trace?: unknown
  accessToken?: string
  refreshToken?: string
  expiresIn?: number
}

/** Login — anon gateway + credentials body */
export async function loginRequest(username: string, password: string): Promise<LoginResponse> {
  assertConfig()
  const res = await fetch(`${API_BASE_URL}/login`, {
    method: 'POST',
    headers: publicHeaders(),
    body: JSON.stringify({ username, password }),
  })
  const body = (await parseJsonOrThrow(res)) as LoginResponse
  return body
}

/** Logout — Bearer access token */
export async function logoutRequest(accessToken: string): Promise<void> {
  assertConfig()
  const res = await fetch(`${API_BASE_URL}/logout`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({}),
  })
  await parseJsonOrThrow(res)
}

/**
 * Authenticated POST to a function name (e.g. chat, invoices).
 * On 401, refreshes once and retries.
 */
export async function callApi<T>(functionName: string, body: object): Promise<T> {
  assertConfig()
  let tokens = await getTokens()
  if (!tokens) throw new Error('Oturum bulunamadı. Lütfen tekrar giriş yapın.')

  const doFetch = async (access: string) =>
    fetch(`${API_BASE_URL}/${functionName}`, {
      method: 'POST',
      headers: authHeaders(access),
      body: JSON.stringify(body),
    })

  let res = await doFetch(tokens.accessToken)
  if (res.status === 401) {
    const refreshed = await refreshTokensLocked()
    if (!refreshed) throw new Error('Oturum süresi doldu. Lütfen tekrar giriş yapın.')
    res = await doFetch(refreshed.accessToken)
  }
  return parseJsonOrThrow(res) as Promise<T>
}

/** @deprecated use callApi */
export async function callEdgeFunction<T>(
  name: string,
  body: object,
): Promise<T> {
  return callApi<T>(name, body)
}
