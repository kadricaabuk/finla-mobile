import { corsHeaders, handleCors } from '../_shared/cors.ts'
import {
  extractGibUserDataStringPatch,
  faturaGetUserData,
  faturaUpdateUserData,
  mergeGibUserDataPatch,
  type UserData,
} from '../_shared/gib.ts'
import { getSubjectFromAuthHeader, SessionAuthError } from '../_shared/session-auth.ts'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const username = await getSubjectFromAuthHeader(req)

    let body: unknown = {}
    try {
      body = await req.json()
    } catch {
      body = {}
    }

    const updates = isRecord(body) ? body['updates'] : undefined
    const picked =
      isRecord(updates) ? extractGibUserDataStringPatch(updates) : {}

    if (Object.keys(picked).length > 0) {
      const current = (await faturaGetUserData(username)) as UserData
      const merged = mergeGibUserDataPatch(current, picked)
      await faturaUpdateUserData(username, merged)
      const profile = (await faturaGetUserData(username)) as UserData
      return Response.json({ profile }, { headers: corsHeaders })
    }

    const profile = await faturaGetUserData(username)
    return Response.json({ profile }, { headers: corsHeaders })
  } catch (err) {
    if (err instanceof SessionAuthError) {
      return Response.json({ error: err.message }, { status: err.status, headers: corsHeaders })
    }
    const message = err instanceof Error ? err.message : 'Kullanıcı bilgileri alınamadı.'
    return Response.json({ error: message }, { status: 500, headers: corsHeaders })
  }
})
