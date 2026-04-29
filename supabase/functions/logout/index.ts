import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { faturaLogout } from '../_shared/gib.ts'
import {
  getSubjectFromAuthHeader,
  revokeSubjectSessions,
  SessionAuthError,
} from '../_shared/session-auth.ts'

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const username = await getSubjectFromAuthHeader(req)
    await faturaLogout(username)
    await revokeSubjectSessions(username)
    return Response.json({ success: true }, { headers: corsHeaders })
  } catch (err) {
    if (err instanceof SessionAuthError) {
      return Response.json({ success: false, error: err.message }, { status: err.status, headers: corsHeaders })
    }
    const message = err instanceof Error ? err.message : 'GIB oturumu kapatılamadı.'
    return Response.json({ success: false, error: message }, { headers: corsHeaders })
  }
})
