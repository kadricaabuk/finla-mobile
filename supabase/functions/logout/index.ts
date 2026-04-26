import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { gibLogout } from '../_shared/gib.ts'

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const { username } = await req.json()
    if (username) await gibLogout(username)
    return Response.json({ success: true }, { headers: corsHeaders })
  } catch {
    return Response.json({ success: true }, { headers: corsHeaders })
  }
})
