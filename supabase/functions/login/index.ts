import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { GibAuthError, gibLoginWithTrace } from '../_shared/gib.ts'

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const { username, password } = await req.json()

    if (!username || !password) {
      // Always return 200 so the Supabase client can read the body
      return Response.json(
        { success: false, error: 'Kullanıcı adı ve şifre gereklidir.' },
        { headers: corsHeaders },
      )
    }

    const loginResult = await gibLoginWithTrace(username, password)

    return Response.json(
      { success: true, trace: loginResult.trace.slice(-5) },
      { headers: corsHeaders },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Giriş başarısız.'
    console.error('GIB login error:', message)
    const errorCode = err instanceof GibAuthError ? err.code : 'UNKNOWN'
    const trace = err instanceof GibAuthError ? err.trace.slice(-8) : []
    return Response.json(
      { success: false, error: message, error_code: errorCode, trace },
      { headers: corsHeaders },
    )
  }
})
