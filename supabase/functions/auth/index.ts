import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { normalizePhone } from '../_shared/phone.ts'
import { requestOtp, verifyOtp } from '../_shared/otp-service.ts'
import {
  issueAuthTokensWithClaims,
  SessionAuthError,
} from '../_shared/session-auth.ts'
import {
  assertRecentOtpVerified,
  authenticateUser,
  buildSessionClaims,
  createUser,
  findUserByPhone,
  linkTenantForUser,
  markOnboardingCompleted,
} from '../_shared/user-service.ts'

type AuthBody = {
  action?: string
  phone?: string
  code?: string
  password?: string
  vkn_tckn?: string
  display_name?: string
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  )
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') {
    return Response.json({ error: 'Method Not Allowed' }, { status: 405, headers: corsHeaders })
  }

  try {
    const body = (await req.json().catch(() => ({}))) as AuthBody
    const action = typeof body.action === 'string' ? body.action.trim() : ''

    if (action === 'request-otp') {
      const phone = typeof body.phone === 'string' ? body.phone : ''
      if (!phone.trim()) {
        return Response.json(
          { success: false, error: 'Telefon numarası gerekli.' },
          { headers: corsHeaders },
        )
      }
      const normalized = normalizePhone(phone)
      const existing = await findUserByPhone(normalized)
      if (existing) {
        return Response.json(
          {
            success: false,
            error: 'Bu telefon numarası zaten kayıtlı. Giriş yap.',
            error_code: 'PHONE_EXISTS',
          },
          { headers: corsHeaders },
        )
      }
      const { debugCode } = await requestOtp(phone, 'register')
      return Response.json(
        {
          success: true,
          message: 'Doğrulama kodu gönderildi.',
          ...(debugCode ? { debug_code: debugCode } : {}),
        },
        { headers: corsHeaders },
      )
    }

    if (action === 'verify-otp') {
      const phone = typeof body.phone === 'string' ? body.phone : ''
      const code = typeof body.code === 'string' ? body.code : ''
      if (!phone.trim() || !code.trim()) {
        return Response.json(
          { success: false, error: 'Telefon ve doğrulama kodu gerekli.' },
          { headers: corsHeaders },
        )
      }
      await verifyOtp(phone, 'register', code)
      return Response.json(
        { success: true, message: 'Telefon doğrulandı. Şifreni belirle.' },
        { headers: corsHeaders },
      )
    }

    if (action === 'set-password') {
      const phone = typeof body.phone === 'string' ? body.phone : ''
      const password = typeof body.password === 'string' ? body.password : ''
      if (!phone.trim() || !password.trim()) {
        return Response.json(
          { success: false, error: 'Telefon ve şifre gerekli.' },
          { headers: corsHeaders },
        )
      }
      const normalized = normalizePhone(phone)
      await assertRecentOtpVerified(normalized, 'register')
      const user = await createUser(normalized, password)
      const claims = await buildSessionClaims(user.id)
      const tokens = await issueAuthTokensWithClaims(claims)
      return Response.json(
        {
          success: true,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresIn: tokens.expiresIn,
          onboarding_status: claims.onboarding_status,
          onboarding_completed: claims.onboarding_completed,
        },
        { headers: corsHeaders },
      )
    }

    if (action === 'login') {
      const phone = typeof body.phone === 'string' ? body.phone : ''
      const password = typeof body.password === 'string' ? body.password : ''
      if (!phone.trim() || !password.trim()) {
        return Response.json(
          { success: false, error: 'Telefon ve şifre gerekli.' },
          { headers: corsHeaders },
        )
      }
      const user = await authenticateUser(phone, password)
      const claims = await buildSessionClaims(user.id)
      const tokens = await issueAuthTokensWithClaims(claims)
      return Response.json(
        {
          success: true,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresIn: tokens.expiresIn,
          onboarding_status: claims.onboarding_status,
          tenant_vkn: claims.tenant_vkn,
          onboarding_completed: claims.onboarding_completed,
        },
        { headers: corsHeaders },
      )
    }

    if (action === 'link-tenant') {
      const { requireFinlaSession } = await import('../_shared/session-auth.ts')
      const session = await requireFinlaSession(req)
      const vkn = typeof body.vkn_tckn === 'string' ? body.vkn_tckn : ''
      const displayName =
        typeof body.display_name === 'string' ? body.display_name : undefined
      if (!vkn.trim()) {
        return Response.json(
          { success: false, error: 'VKN/TCKN gerekli.' },
          { status: 400, headers: corsHeaders },
        )
      }
      if (!isUuid(session.userId)) {
        throw new SessionAuthError('Oturum geçersiz.', 401)
      }
      await linkTenantForUser(session.userId, vkn, displayName)
      const claims = await buildSessionClaims(session.userId)
      const tokens = await issueAuthTokensWithClaims(claims)
      return Response.json(
        {
          success: true,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresIn: tokens.expiresIn,
          onboarding_status: claims.onboarding_status,
          tenant_vkn: claims.tenant_vkn,
          tenant_name: claims.tenant_name,
          onboarding_completed: claims.onboarding_completed,
        },
        { headers: corsHeaders },
      )
    }

    if (action === 'complete-onboarding') {
      const { requireFinlaSession } = await import('../_shared/session-auth.ts')
      const session = await requireFinlaSession(req)
      if (!isUuid(session.userId)) {
        throw new SessionAuthError('Oturum geçersiz.', 401)
      }
      await markOnboardingCompleted(session.userId)
      const claims = await buildSessionClaims(session.userId)
      const tokens = await issueAuthTokensWithClaims(claims)
      return Response.json(
        {
          success: true,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresIn: tokens.expiresIn,
          onboarding_status: claims.onboarding_status,
          tenant_vkn: claims.tenant_vkn,
          tenant_name: claims.tenant_name,
          onboarding_completed: claims.onboarding_completed,
        },
        { headers: corsHeaders },
      )
    }

    return Response.json(
      {
        success: false,
        error:
          'Bilinmeyen action. request-otp, verify-otp, set-password, login, link-tenant, complete-onboarding kullan.',
      },
      { status: 400, headers: corsHeaders },
    )
  } catch (err) {
    if (err instanceof SessionAuthError) {
      return Response.json(
        { success: false, error: err.message },
        { status: err.status, headers: corsHeaders },
      )
    }
    const message = err instanceof Error ? err.message : 'İşlem başarısız.'
    console.error('auth error:', message)
    return Response.json({ success: false, error: message }, { headers: corsHeaders })
  }
})
