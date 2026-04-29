import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { rotateRefreshToken } from '../_shared/session-auth.ts'

Deno.serve(async req => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const { refreshToken } = await req.json()
    if (!refreshToken || typeof refreshToken !== 'string') {
      return Response.json({ success: false, error: 'refreshToken zorunludur.' }, { headers: corsHeaders })
    }
    const tokens = await rotateRefreshToken(refreshToken)
    return Response.json(
      {
        success: true,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
      },
      { headers: corsHeaders },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Token yenileme başarısız.'
    return Response.json({ success: false, error: message }, { headers: corsHeaders })
  }
})
