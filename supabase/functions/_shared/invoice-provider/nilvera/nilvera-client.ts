export interface NilveraClientConfig {
  apiKey: string
  /** Default: https://apitest.nilvera.com (overridable via env NILVERA_API_URL). */
  baseUrl?: string
}

function resolveBaseUrl(config: NilveraClientConfig): string {
  return (
    config.baseUrl?.trim() ||
    Deno.env.get('NILVERA_API_URL')?.trim() ||
    'https://apitest.nilvera.com'
  )
}

function buildUrl(baseUrl: string, path: string, query?: Record<string, string | number | undefined>): string {
  const url = new URL(path.startsWith('/') ? path : `/${path}`, baseUrl)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue
      url.searchParams.set(key, String(value))
    }
  }
  return url.toString()
}

async function throwOnError(res: Response, path: string): Promise<void> {
  if (res.ok) return
  const bodyText = await res.text().catch(() => '')
  if (res.status === 401) {
    throw new Error(
      'Nilvera API anahtarı geçersiz veya süresi dolmuş. Firma bağlantısını kontrol et.',
    )
  }
  throw new Error(
    `Nilvera servis hatası (${res.status} ${path}): ${bodyText.slice(0, 300) || res.statusText}`,
  )
}

export interface NilveraClient {
  request<T>(
    path: string,
    init?: {
      method?: string
      query?: Record<string, string | number | undefined>
      body?: unknown
    },
  ): Promise<T>
  getText(path: string, query?: Record<string, string | number | undefined>): Promise<string>
  getBinary(path: string, query?: Record<string, string | number | undefined>): Promise<Uint8Array>
}

export function createNilveraClient(config: NilveraClientConfig): NilveraClient {
  const baseUrl = resolveBaseUrl(config)

  function headers(extra?: Record<string, string>): Record<string, string> {
    return {
      Authorization: `Bearer ${config.apiKey}`,
      ...extra,
    }
  }

  return {
    async request<T>(
      path: string,
      init?: {
        method?: string
        query?: Record<string, string | number | undefined>
        body?: unknown
      },
    ): Promise<T> {
      const url = buildUrl(baseUrl, path, init?.query)
      const method = init?.method ?? (init?.body !== undefined ? 'POST' : 'GET')
      const res = await fetch(url, {
        method,
        headers: headers(
          init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
        ),
        body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      })
      await throwOnError(res, path)
      const text = await res.text()
      if (!text) return undefined as T
      return JSON.parse(text) as T
    },

    async getText(path, query): Promise<string> {
      const url = buildUrl(baseUrl, path, query)
      const res = await fetch(url, { headers: headers() })
      await throwOnError(res, path)
      return await res.text()
    },

    async getBinary(path, query): Promise<Uint8Array> {
      const url = buildUrl(baseUrl, path, query)
      const res = await fetch(url, { headers: headers() })
      await throwOnError(res, path)
      return new Uint8Array(await res.arrayBuffer())
    },
  }
}
