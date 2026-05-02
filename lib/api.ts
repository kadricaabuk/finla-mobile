import { invalidateInvoiceCaches } from '@/lib/invoices-cache'
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

function responseLooksLikeHtml(text: string): boolean {
  const t = text.trimStart()
  if (!t.startsWith('<')) return false
  return /<\/?(html|head|body|!doctype)/i.test(t.slice(0, 400))
}

function friendlyHttpFailureMessage(status: number, nonJsonBody: boolean): string {
  if (nonJsonBody && (status === 404 || status === 406)) {
    return 'Servis adresi bulunamadı. Güncelleme yayınlanıyorsa bir süre sonra tekrar deneyin.'
  }
  if (nonJsonBody || status >= 500 || status === 502 || status === 503 || status === 522 || status === 524) {
    return 'Şu anda sunucuya bağlanılamıyor veya servis bakımda. Biraz sonra tekrar deneyin.'
  }
  return status === 401 || status === 403
    ? 'Oturum süresi doldu veya erişim reddedildi. Çıkış yapıp tekrar giriş yapmayı deneyin.'
    : `İstek başarısız oldu (${status}). Tekrar deneyin.`
}

/** JSON parse/HTML proxy hatalarını kullanıcı metnine çevirir (UI için). */
export function userFacingApiError(err: unknown): string {
  const msg =
    typeof err === 'string' ? err : err instanceof Error ? err.message : String(err)
  const m = msg.toLowerCase()
  if (
    m.includes('unexpected token') ||
    m.includes('is not valid json') ||
    m.includes('<!doctype') ||
    (m.includes('<html') && m.includes('json'))
  ) {
    return 'Sunucu beklenen veri yerine hata sayfası döndü. Bağlantınızı kontrol edin; sorun devam ederse bir süre sonra tekrar deneyin.'
  }
  if (m.includes('network request failed') || m.includes('failed to fetch') || m.includes('econnrefused')) {
    return 'Ağ bağlantısı kurulamadı. İnternetinizi kontrol edin.'
  }
  return typeof err === 'string' ? err : err instanceof Error ? err.message : 'Beklenmeyen bir sorun oluştu.'
}

async function parseJsonOrThrow(res: Response): Promise<unknown> {
  const text = await res.text()
  const contentType = (res.headers.get('content-type') ?? '').toLowerCase()

  let body: unknown = null
  let parsed = false
  if (text.trim().length === 0) {
    parsed = true
    body = null
  } else {
    try {
      body = JSON.parse(text)
      parsed = true
    } catch {
      parsed = false
      body = null
    }
  }

  const looksHtml =
    !parsed ||
    responseLooksLikeHtml(text) ||
    contentType.includes('text/html')

  if (!res.ok) {
    if (looksHtml || !parsed || typeof body !== 'object' || body === null) {
      throw new Error(friendlyHttpFailureMessage(res.status, true))
    }
    const obj = body as Record<string, unknown>
    const serverErr = typeof obj.error === 'string' ? obj.error : ''
    const serverMsg = typeof obj.message === 'string' ? obj.message : ''
    let detail = serverErr || serverMsg
    if (detail.trimStart().startsWith('<') || /<html[\s>/]/i.test(detail)) {
      detail = ''
    }
    if (/unexpected token[<']|not valid json/i.test(detail)) {
      throw new Error(friendlyHttpFailureMessage(res.status, true))
    }
    if (detail) throw new Error(detail)
    throw new Error(friendlyHttpFailureMessage(res.status, looksHtml))
  }

  // 200 ama gövde JSON değil (yanlış URL, SPA index, proxy vb.)
  if (!parsed || looksHtml) {
    throw new Error(
      'Sunucu beklenenden farklı yanıt verdi (JSON yerine sayfa görünümü geldi). Bağlantınızı kontrol edin veya daha sonra yeniden deneyin.',
    )
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
    const prev = await getTokens()
    await invalidateInvoiceCaches(prev?.accessToken ?? null)
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
