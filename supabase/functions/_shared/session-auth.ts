import { createClient } from 'npm:@supabase/supabase-js'
import { SignJWT, jwtVerify } from 'npm:jose'
import { sha256Hex } from './crypto.ts'
import { buildSessionClaims } from './user-service.ts'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

const ACCESS_TTL_SECONDS = 15 * 60
const REFRESH_TTL_SECONDS = 14 * 24 * 60 * 60

function getJwtSecret(): Uint8Array {
  const secret = Deno.env.get('AUTH_JWT_SECRET')
  if (!secret) throw new Error('AUTH_JWT_SECRET tanimli degil.')
  return new TextEncoder().encode(secret)
}

function getRefreshPepper(): string {
  return Deno.env.get('AUTH_REFRESH_PEPPER') ?? Deno.env.get('AUTH_JWT_SECRET') ?? ''
}

function randomToken(bytes = 48): string {
  const arr = crypto.getRandomValues(new Uint8Array(bytes))
  let binary = ''
  for (const b of arr) binary += String.fromCharCode(b)
  return btoa(binary)
}

async function hashRefreshToken(token: string): Promise<string> {
  return sha256Hex(`${getRefreshPepper()}:${token}`)
}

export type OnboardingStatus =
  | 'pending'
  | 'tenant_linked'
  | 'active'
  | 'activation_complete'

export interface FinlaSessionClaims {
  sub: string
  typ?: string
  phone?: string
  tenant_vkn?: string
  onboarding_status?: OnboardingStatus
  tenant_name?: string
  onboarding_completed?: boolean
}

export interface FinlaSession {
  userId: string
  phone?: string
  tenantVkn?: string
  onboardingStatus: OnboardingStatus
  tenantName?: string
  onboardingCompleted: boolean
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

export class SessionAuthError extends Error {
  status: number

  constructor(message: string, status = 401) {
    super(message)
    this.name = 'SessionAuthError'
    this.status = status
  }
}

function buildAccessJwtPayload(claims: FinlaSessionClaims): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    sub: claims.sub,
    typ: 'access',
  }
  if (claims.phone) payload.phone = claims.phone
  if (claims.tenant_vkn) payload.tenant_vkn = claims.tenant_vkn
  if (claims.onboarding_status) payload.onboarding_status = claims.onboarding_status
  if (claims.tenant_name) payload.tenant_name = claims.tenant_name
  payload.onboarding_completed = claims.onboarding_completed === true
  return payload
}

export async function issueAuthTokens(subject: string): Promise<AuthTokens> {
  return issueAuthTokensWithClaims({ sub: subject, onboarding_status: 'pending' })
}

export async function issueAuthTokensWithClaims(
  claims: FinlaSessionClaims,
): Promise<AuthTokens> {
  const now = Math.floor(Date.now() / 1000)
  const accessToken = await new SignJWT(buildAccessJwtPayload(claims))
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime(now + ACCESS_TTL_SECONDS)
    .sign(getJwtSecret())

  const refreshToken = randomToken()
  const refreshTokenHash = await hashRefreshToken(refreshToken)
  const expiresAt = new Date((now + REFRESH_TTL_SECONDS) * 1000).toISOString()
  const familyId = crypto.randomUUID()

  const { error } = await supabase.from('auth_sessions').insert({
    subject: claims.sub,
    family_id: familyId,
    refresh_token_hash: refreshTokenHash,
    expires_at: expiresAt,
  })
  if (error) throw error

  return { accessToken, refreshToken, expiresIn: ACCESS_TTL_SECONDS }
}

export async function rotateRefreshToken(refreshToken: string): Promise<AuthTokens> {
  const refreshTokenHash = await hashRefreshToken(refreshToken)
  const { data: row, error } = await supabase
    .from('auth_sessions')
    .select('id,subject,family_id,expires_at,revoked_at')
    .eq('refresh_token_hash', refreshTokenHash)
    .maybeSingle()
  if (error) throw error
  if (!row) throw new Error('Refresh token gecersiz.')
  if (row.revoked_at) throw new Error('Refresh token iptal edilmis.')
  if (new Date(row.expires_at).getTime() <= Date.now()) throw new Error('Refresh token suresi dolmus.')

  const claims = await buildSessionClaims(row.subject)
  const now = Math.floor(Date.now() / 1000)
  const accessToken = await new SignJWT(buildAccessJwtPayload(claims))
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime(now + ACCESS_TTL_SECONDS)
    .sign(getJwtSecret())

  const nextRefreshToken = randomToken()
  const nextHash = await hashRefreshToken(nextRefreshToken)
  const nextExpiresAt = new Date((now + REFRESH_TTL_SECONDS) * 1000).toISOString()

  const { error: revokeError } = await supabase
    .from('auth_sessions')
    .update({ revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', row.id)
  if (revokeError) throw revokeError

  const { error: insertError } = await supabase.from('auth_sessions').insert({
    subject: row.subject,
    family_id: row.family_id,
    refresh_token_hash: nextHash,
    expires_at: nextExpiresAt,
  })
  if (insertError) throw insertError

  return { accessToken, refreshToken: nextRefreshToken, expiresIn: ACCESS_TTL_SECONDS }
}

export async function revokeSubjectSessions(subject: string): Promise<void> {
  const { error } = await supabase
    .from('auth_sessions')
    .update({ revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('subject', subject)
    .is('revoked_at', null)
  if (error) throw error
}

export async function verifyAccessTokenClaims(
  accessToken: string,
): Promise<FinlaSessionClaims> {
  let payload: FinlaSessionClaims & { typ?: string }
  try {
    const verified = await jwtVerify(accessToken, getJwtSecret())
    payload = verified.payload as FinlaSessionClaims & { typ?: string }
  } catch {
    throw new SessionAuthError('Access token gecersiz veya suresi dolmus.', 401)
  }
  if (payload.typ !== 'access' || typeof payload.sub !== 'string') {
    throw new SessionAuthError('Access token gecersiz.', 401)
  }
  return {
    sub: payload.sub,
    phone: payload.phone,
    tenant_vkn: payload.tenant_vkn,
    onboarding_status: payload.onboarding_status ?? 'pending',
    tenant_name: payload.tenant_name,
    onboarding_completed: payload.onboarding_completed === true,
  }
}

export async function verifyAccessToken(accessToken: string): Promise<{ subject: string }> {
  const claims = await verifyAccessTokenClaims(accessToken)
  return { subject: claims.sub }
}

function extractAccessToken(req: Request): string {
  const direct = req.headers.get('x-finla-access-token')
  if (direct && direct.trim().length > 0) return direct.trim()
  const raw = req.headers.get('authorization') ?? ''
  const [, token] = raw.match(/^Bearer\s+(.+)$/i) ?? []
  if (!token) throw new SessionAuthError('Authorization Bearer token gerekli.', 401)
  return token
}

export async function requireFinlaSession(req: Request): Promise<FinlaSession> {
  const token = extractAccessToken(req)
  const claims = await verifyAccessTokenClaims(token)
  return {
    userId: claims.sub,
    phone: claims.phone,
    tenantVkn: claims.tenant_vkn,
    onboardingStatus: claims.onboarding_status ?? 'pending',
    tenantName: claims.tenant_name,
    onboardingCompleted: claims.onboarding_completed === true,
  }
}

export async function getSubjectFromAuthHeader(req: Request): Promise<string> {
  const token = extractAccessToken(req)
  const { subject } = await verifyAccessToken(token)
  return subject
}
