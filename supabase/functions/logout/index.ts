import { corsHeaders, handleCors } from '../_shared/cors.ts'
import {
  requireFinlaSession,
  revokeSubjectSessions,
  SessionAuthError,
} from '../_shared/session-auth.ts'

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const session = await requireFinlaSession(req)
    await revokeSubjectSessions(session.userId)
    return Response.json({ success: true }, { headers: corsHeaders })
  } catch (err) {
    if (err instanceof SessionAuthError) {
      return Response.json({ success: false, error: err.message }, { status: err.status, headers: corsHeaders })
    }
    const message = err instanceof Error ? err.message : 'Oturum kapatılamadı.'
    return Response.json({ success: false, error: message }, { headers: corsHeaders })
  }
})
