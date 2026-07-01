import { corsHeaders, handleCors } from '../_shared/cors.ts'
import {
  getUserProfile,
  updateUserProfile,
} from '../_shared/profile-service.ts'
import { requireFinlaSession, SessionAuthError } from '../_shared/session-auth.ts'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const session = await requireFinlaSession(req)

    let body: unknown = {}
    try {
      body = await req.json()
    } catch {
      body = {}
    }

    const updates = isRecord(body) ? body['updates'] : undefined
    const picked = isRecord(updates) ? updates : {}

    if (Object.keys(picked).length > 0) {
      const profile = await updateUserProfile(session, picked)
      return Response.json({ profile }, { headers: corsHeaders })
    }

    const profile = await getUserProfile(session)
    return Response.json({ profile }, { headers: corsHeaders })
  } catch (err) {
    if (err instanceof SessionAuthError) {
      return Response.json({ error: err.message }, { status: err.status, headers: corsHeaders })
    }
    const message = err instanceof Error ? err.message : 'Kullanıcı bilgileri alınamadı.'
    return Response.json({ error: message }, { status: 500, headers: corsHeaders })
  }
})
