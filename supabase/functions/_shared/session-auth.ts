import { createClient } from 'npm:@supabase/supabase-js'
import { SignJWT, jwtVerify } from 'npm:jose'
import { sha256Hex } from './crypto.ts'

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

export async function issueAuthTokens(subject: string): Promise<AuthTokens> {
  const now = Math.floor(Date.now() / 1000)
  const accessToken = await new SignJWT({ sub: subject, typ: 'access' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime(now + ACCESS_TTL_SECONDS)
    .sign(getJwtSecret())

  const refreshToken = randomToken()
  const refreshTokenHash = await hashRefreshToken(refreshToken)
  const expiresAt = new Date((now + REFRESH_TTL_SECONDS) * 1000).toISOString()
  const familyId = crypto.randomUUID()

  const { error } = await supabase.from('auth_sessions').insert({
    subject,
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

  const now = Math.floor(Date.now() / 1000)
  const accessToken = await new SignJWT({ sub: row.subject, typ: 'access' })
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

export async function verifyAccessToken(accessToken: string): Promise<{ subject: string }> {
  let payload: { sub?: string; typ?: string }
  try {
    const verified = await jwtVerify(accessToken, getJwtSecret())
    payload = verified.payload as { sub?: string; typ?: string }
  } catch {
    throw new SessionAuthError('Access token gecersiz veya suresi dolmus.', 401)
  }
  if (payload.typ !== 'access' || typeof payload.sub !== 'string') {
    throw new SessionAuthError('Access token gecersiz.', 401)
  }
  return { subject: payload.sub }
}

export async function getSubjectFromAuthHeader(req: Request): Promise<string> {
  const direct = req.headers.get('x-finla-access-token')
  if (direct && direct.trim().length > 0) {
    const { subject } = await verifyAccessToken(direct.trim())
    return subject
  }
  const raw = req.headers.get('authorization') ?? ''
  const [, token] = raw.match(/^Bearer\s+(.+)$/i) ?? []
  if (!token) throw new SessionAuthError('Authorization Bearer token gerekli.', 401)
  const { subject } = await verifyAccessToken(token)
  return subject
}
