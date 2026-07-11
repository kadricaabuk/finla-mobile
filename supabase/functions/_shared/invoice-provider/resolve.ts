import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js'
import { decryptSecret } from '../crypto.ts'

// Lazy: created on first use, not at module import time — avoids blowing up
// the import in contexts without SUPABASE_URL, like tests.
let cachedClient: SupabaseClient | null = null
function getSupabase(): SupabaseClient {
  if (!cachedClient) {
    cachedClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
  }
  return cachedClient
}

export type ProviderName = 'mysoft' | 'nilvera'

export interface TenantProviderConfig {
  provider: ProviderName
  nilvera?: { apiKey: string; environment: 'test' | 'prod' }
}

const CACHE_TTL_MS = 60_000
const cache = new Map<string, { value: TenantProviderConfig; expiresAt: number }>()

async function loadNilveraCredentials(
  tenantId: string,
): Promise<{ apiKey: string; environment: 'test' | 'prod' }> {
  const { data, error } = await getSupabase()
    .from('tenant_provider_credentials')
    .select('api_key_enc,api_key_iv,api_key_tag,environment')
    .eq('tenant_id', tenantId)
    .eq('provider', 'nilvera')
    .maybeSingle()
  if (error) throw error
  if (!data) {
    throw new Error(
      'Nilvera hesabı bu firma için yapılandırılmamış. Destek ekibiyle iletişime geç.',
    )
  }

  const apiKey = await decryptSecret({
    secretEnc: data.api_key_enc,
    secretIv: data.api_key_iv,
    secretTag: data.api_key_tag,
  })
  const environment = data.environment === 'prod' ? 'prod' : 'test'
  return { apiKey, environment }
}

async function resolveUncached(tenantVkn: string): Promise<TenantProviderConfig> {
  const { data: tenant, error } = await getSupabase()
    .from('tenants')
    .select('id,provider')
    .eq('vkn_tckn', tenantVkn)
    .maybeSingle()
  if (error) throw error
  if (!tenant) return { provider: 'mysoft' }

  const provider = tenant.provider === 'nilvera' ? 'nilvera' : 'mysoft'
  if (provider === 'mysoft') return { provider }

  const nilvera = await loadNilveraCredentials(tenant.id as string)
  return { provider, nilvera }
}

/** Resolves the active provider (and credentials, if any) for a tenant's VKN. */
export async function resolveTenantProvider(
  tenantVkn?: string,
): Promise<TenantProviderConfig> {
  const vkn = tenantVkn?.trim()
  if (!vkn) return { provider: 'mysoft' }

  const cached = cache.get(vkn)
  if (cached && cached.expiresAt > Date.now()) return cached.value

  const value = await resolveUncached(vkn)
  cache.set(vkn, { value, expiresAt: Date.now() + CACHE_TTL_MS })
  return value
}
