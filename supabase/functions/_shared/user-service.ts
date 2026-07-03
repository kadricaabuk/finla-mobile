import { createClient } from 'npm:@supabase/supabase-js'
import { hashPassword, verifyPassword } from './password.ts'
import { normalizePhone, normalizeVknTckn } from './phone.ts'
import { isMockMode } from './invoice-provider/mock-provider.ts'
import { assertMysoftTenantExists } from './mysoft-tenant.ts'
import type { FinlaSessionClaims, OnboardingStatus } from './session-auth.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

export interface UserRow {
  id: string
  phone: string
  password_hash: string
  created_at: string
  last_login_at: string | null
  onboarding_completed: boolean
}

export interface TenantRow {
  id: string
  vkn_tckn: string
  display_name: string | null
  mysoft_status: string
}

export async function findUserByPhone(phone: string): Promise<UserRow | null> {
  const { data, error } = await supabase
    .from('users')
    .select('id,phone,password_hash,created_at,last_login_at,onboarding_completed')
    .eq('phone', phone)
    .maybeSingle()
  if (error) throw error
  return data as UserRow | null
}

export async function findUserById(userId: string): Promise<UserRow | null> {
  const { data, error } = await supabase
    .from('users')
    .select('id,phone,password_hash,created_at,last_login_at,onboarding_completed')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return data as UserRow | null
}

export async function createUser(phone: string, password: string): Promise<UserRow> {
  const existing = await findUserByPhone(phone)
  if (existing) throw new Error('Bu telefon numarası zaten kayıtlı. Giriş yap.')

  const passwordHash = await hashPassword(password)
  const { data, error } = await supabase
    .from('users')
    .insert({ phone, password_hash: passwordHash })
    .select('id,phone,password_hash,created_at,last_login_at,onboarding_completed')
    .single()
  if (error) throw error
  return data as UserRow
}

export async function authenticateUser(
  rawPhone: string,
  password: string,
): Promise<UserRow> {
  const phone = normalizePhone(rawPhone)
  const user = await findUserByPhone(phone)
  if (!user) throw new Error('Telefon veya şifre hatalı.')

  const ok = await verifyPassword(password, user.password_hash)
  if (!ok) throw new Error('Telefon veya şifre hatalı.')

  await supabase
    .from('users')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', user.id)

  return user
}

export async function getPrimaryTenantForUser(
  userId: string,
): Promise<TenantRow | null> {
  const { data, error } = await supabase
    .from('user_tenants')
    .select('tenant_id, tenants(id,vkn_tckn,display_name,mysoft_status)')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()
  if (error) throw error
  const tenant = data?.tenants as TenantRow | TenantRow[] | null | undefined
  if (!tenant) return null
  if (Array.isArray(tenant)) return tenant[0] ?? null
  return tenant
}

export async function buildSessionClaims(userId: string): Promise<FinlaSessionClaims> {
  const user = await findUserById(userId)
  if (!user) throw new Error('Kullanıcı bulunamadı.')

  const tenant = await getPrimaryTenantForUser(userId)
  let onboardingStatus: OnboardingStatus = 'pending'
  if (tenant) {
    onboardingStatus =
      tenant.mysoft_status === 'active' ? 'active' : 'tenant_linked'
  }

  return {
    sub: user.id,
    phone: user.phone,
    tenant_vkn: tenant?.vkn_tckn,
    onboarding_status: onboardingStatus,
    tenant_name: tenant?.display_name ?? undefined,
    onboarding_completed: user.onboarding_completed,
  }
}

export async function markOnboardingCompleted(userId: string): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({ onboarding_completed: true })
    .eq('id', userId)
  if (error) throw error
}

export async function linkTenantForUser(
  userId: string,
  rawVkn: string,
  displayName?: string,
): Promise<TenantRow> {
  const vknTckn = normalizeVknTckn(rawVkn)
  const name = displayName?.trim() || `Firma ${vknTckn}`

  await assertMysoftTenantExists(vknTckn)

  const { data: existingTenant, error: findErr } = await supabase
    .from('tenants')
    .select('id,vkn_tckn,display_name,mysoft_status')
    .eq('vkn_tckn', vknTckn)
    .maybeSingle()
  if (findErr) throw findErr

  let tenantId: string
  if (existingTenant?.id) {
    tenantId = existingTenant.id as string
    await supabase
      .from('tenants')
      .update({
        display_name: name,
        mysoft_status: isMockMode() ? 'mock_linked' : 'linked',
      })
      .eq('id', tenantId)
  } else {
    const { data: created, error: createErr } = await supabase
      .from('tenants')
      .insert({
        vkn_tckn: vknTckn,
        display_name: name,
        mysoft_status: isMockMode() ? 'mock_linked' : 'linked',
      })
      .select('id')
      .single()
    if (createErr) throw createErr
    tenantId = created.id as string
  }

  const { error: linkErr } = await supabase.from('user_tenants').upsert(
    { user_id: userId, tenant_id: tenantId, role: 'owner' },
    { onConflict: 'user_id,tenant_id' },
  )
  if (linkErr) throw linkErr

  const { data: tenant, error: tenantErr } = await supabase
    .from('tenants')
    .select('id,vkn_tckn,display_name,mysoft_status')
    .eq('id', tenantId)
    .single()
  if (tenantErr) throw tenantErr
  return tenant as TenantRow
}

export async function assertRecentOtpVerified(
  phone: string,
  purpose: 'register' | 'reset_password',
): Promise<void> {
  const { data, error } = await supabase
    .from('otp_challenges')
    .select('verified_at')
    .eq('phone', phone)
    .eq('purpose', purpose)
    .not('verified_at', 'is', null)
    .order('verified_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data?.verified_at) {
    throw new Error('Önce telefon doğrulaması yap.')
  }
  const verifiedAt = new Date(data.verified_at as string).getTime()
  if (Date.now() - verifiedAt > 10 * 60 * 1000) {
    throw new Error('Telefon doğrulamasının süresi doldu. Yeni kod iste.')
  }
}
