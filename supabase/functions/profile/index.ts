import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { faturaGetUserData } from '../_shared/gib.ts'
import { getSubjectFromAuthHeader, SessionAuthError } from '../_shared/session-auth.ts'

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const username = await getSubjectFromAuthHeader(req)
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
