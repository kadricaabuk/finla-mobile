export type MysoftTokenResponse = {
  access_token?: string
  token_type?: string
  expires_in?: number
  error?: string
  error_description?: string
}

export type MysoftApiEnvelope<T = unknown> = {
  success?: boolean
  succeed?: boolean
  message?: string
  data?: T
  errorCode?: unknown
  afterValue?: unknown
  [key: string]: unknown
}

let cachedToken: { value: string; expiresAtMs: number } | null = null

function getApiBaseUrl(): string {
  const raw = Deno.env.get('MYSOFT_API_URL')?.trim() ||
    'https://edocumentapi.mytest.tr'
  return raw.replace(/\/$/, '')
}

function getCredentials(): { username: string; password: string } {
  const username = Deno.env.get('MYSOFT_USERNAME')?.trim() ?? ''
  const password = Deno.env.get('MYSOFT_PASSWORD')?.trim() ?? ''
  if (!username || !password) {
    throw new Error(
      'Mysoft API kimlik bilgileri eksik. MYSOFT_USERNAME ve MYSOFT_PASSWORD tanımlayın.',
    )
  }
  return { username, password }
}

export function clearMysoftTokenCache(): void {
  cachedToken = null
}

export async function fetchMysoftAccessToken(forceRefresh = false): Promise<string> {
  const now = Date.now()
  if (!forceRefresh && cachedToken && cachedToken.expiresAtMs > now + 30_000) {
    return cachedToken.value
  }

  const { username, password } = getCredentials()
  const body = new URLSearchParams({
    grant_type: 'password',
    username,
    password,
  })

  const res = await fetch(`${getApiBaseUrl()}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  const json = (await res.json().catch(() => ({}))) as MysoftTokenResponse
  if (!res.ok || !json.access_token) {
    const detail = json.error_description ?? json.error ?? res.statusText
    throw new Error(`Mysoft OAuth başarısız: ${detail}`)
  }

  const ttlMs = Math.max(60, Number(json.expires_in ?? 3600)) * 1000
  cachedToken = {
    value: json.access_token,
    expiresAtMs: now + ttlMs,
  }
  return json.access_token
}

export async function mysoftRequest<T = unknown>(
  path: string,
  init: RequestInit & { query?: Record<string, string | undefined> } = {},
): Promise<T> {
  const token = await fetchMysoftAccessToken()
  const url = new URL(
    path.startsWith('http') ? path : `${getApiBaseUrl()}${path.startsWith('/') ? '' : '/'}${path}`,
  )
  for (const [key, value] of Object.entries(init.query ?? {})) {
    if (typeof value === 'string' && value.trim()) url.searchParams.set(key, value)
  }

  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  let res = await fetch(url.toString(), { ...init, headers })

  if (res.status === 401) {
    const retryToken = await fetchMysoftAccessToken(true)
    headers.set('Authorization', `Bearer ${retryToken}`)
    res = await fetch(url.toString(), { ...init, headers })
  }

  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    if (!res.ok) {
      throw new Error(`Mysoft API hatası (${res.status}): ${res.statusText}`)
    }
    return (await res.arrayBuffer()) as T
  }

  const json = (await res.json()) as MysoftApiEnvelope<T>
  if (!res.ok) {
    const detail =
      (typeof json.message === 'string' && json.message) ||
      (typeof json.error === 'string' && json.error) ||
      res.statusText
    throw new Error(`Mysoft API hatası (${res.status}): ${detail}`)
  }
  if (json.success === false || json.succeed === false) {
    throw new Error(
      typeof json.message === 'string'
        ? json.message
        : 'Mysoft API işlemi başarısız.',
    )
  }
  return (json.data ?? json) as T
}

/** Tam API zarfını döndürür (liste parse için `data` + `succeed` birlikte). */
export async function mysoftRequestEnvelope(
  path: string,
  init: RequestInit & { query?: Record<string, string | undefined> } = {},
): Promise<MysoftApiEnvelope> {
  const token = await fetchMysoftAccessToken()
  const url = new URL(
    path.startsWith('http') ? path : `${getApiBaseUrl()}${path.startsWith('/') ? '' : '/'}${path}`,
  )
  for (const [key, value] of Object.entries(init.query ?? {})) {
    if (typeof value === 'string' && value.trim()) url.searchParams.set(key, value)
  }

  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  let res = await fetch(url.toString(), { ...init, headers })
  if (res.status === 401) {
    const retryToken = await fetchMysoftAccessToken(true)
    headers.set('Authorization', `Bearer ${retryToken}`)
    res = await fetch(url.toString(), { ...init, headers })
  }

  const json = (await res.json()) as MysoftApiEnvelope
  if (!res.ok) {
    const detail =
      (typeof json.message === 'string' && json.message) ||
      (typeof json.error === 'string' && json.error) ||
      res.statusText
    throw new Error(`Mysoft API hatası (${res.status}): ${detail}`)
  }
  if (json.success === false || json.succeed === false) {
    throw new Error(
      typeof json.message === 'string'
        ? json.message
        : 'Mysoft API işlemi başarısız.',
    )
  }
  return json
}

export async function mysoftGetBinary(
  path: string,
  query?: Record<string, string | undefined>,
): Promise<Uint8Array> {
  const token = await fetchMysoftAccessToken()
  const url = new URL(`${getApiBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`)
  for (const [key, value] of Object.entries(query ?? {})) {
    if (typeof value === 'string' && value.trim()) url.searchParams.set(key, value)
  }

  let res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (res.status === 401) {
    const retryToken = await fetchMysoftAccessToken(true)
    res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${retryToken}` },
    })
  }

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Mysoft indirme hatası (${res.status}): ${text.slice(0, 200)}`)
  }

  const buf = new Uint8Array(await res.arrayBuffer())
  const contentType = res.headers.get('content-type') ?? ''

  if (contentType.includes('application/json')) {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(buf).trim()
    if (text.startsWith('{')) {
      try {
        const json = JSON.parse(text) as {
          succeed?: boolean
          success?: boolean
          message?: string
        }
        if (json.succeed === false || json.success === false) {
          throw new Error(
            typeof json.message === 'string'
              ? json.message
              : 'Mysoft indirme başarısız.',
          )
        }
      } catch (err) {
        if (err instanceof Error && !err.message.includes('JSON')) throw err
      }
    }
  }

  return buf
}
