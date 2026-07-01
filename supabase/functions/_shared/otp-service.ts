import { createClient } from 'npm:@supabase/supabase-js'
import { sha256Hex } from './crypto.ts'
import { normalizePhone } from './phone.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const OTP_TTL_MS = 5 * 60 * 1000
const MAX_ATTEMPTS = 5

function generateOtpCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000
  return String(n).padStart(6, '0')
}

function otpDebugEnabled(): boolean {
  return (Deno.env.get('AUTH_OTP_DEBUG') ?? 'true').toLowerCase() !== 'false'
}

async function hashOtp(code: string): Promise<string> {
  return sha256Hex(`otp:${code}`)
}

export async function requestOtp(
  rawPhone: string,
  purpose: 'register' | 'reset_password',
): Promise<{ debugCode?: string }> {
  const phone = normalizePhone(rawPhone)
  const code = generateOtpCode()
  const codeHash = await hashOtp(code)
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString()

  const { error } = await supabase.from('otp_challenges').insert({
    phone,
    purpose,
    code_hash: codeHash,
    expires_at: expiresAt,
    attempts: 0,
  })
  if (error) throw error

  console.log(JSON.stringify({ event: 'auth_otp', phone, purpose, code }))
  const result: { debugCode?: string } = {}
  if (otpDebugEnabled()) result.debugCode = code
  return result
}

export async function verifyOtp(
  rawPhone: string,
  purpose: 'register' | 'reset_password',
  code: string,
): Promise<void> {
  const phone = normalizePhone(rawPhone)
  const trimmed = code.trim()
  if (!/^\d{6}$/.test(trimmed)) throw new Error('Doğrulama kodu 6 haneli olmalı.')

  const { data: row, error } = await supabase
    .from('otp_challenges')
    .select('id,code_hash,expires_at,attempts,verified_at')
    .eq('phone', phone)
    .eq('purpose', purpose)
    .is('verified_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!row) throw new Error('Doğrulama kodu bulunamadı. Yeni kod iste.')

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    throw new Error('Doğrulama kodunun süresi doldu. Yeni kod iste.')
  }
  if ((row.attempts ?? 0) >= MAX_ATTEMPTS) {
    throw new Error('Çok fazla hatalı deneme. Yeni kod iste.')
  }

  const expected = await hashOtp(trimmed)
  if (expected !== row.code_hash) {
    await supabase
      .from('otp_challenges')
      .update({ attempts: (row.attempts ?? 0) + 1 })
      .eq('id', row.id)
    throw new Error('Doğrulama kodu hatalı.')
  }

  const { error: markError } = await supabase
    .from('otp_challenges')
    .update({ verified_at: new Date().toISOString() })
    .eq('id', row.id)
  if (markError) throw markError
}
