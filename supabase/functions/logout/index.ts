import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { gibLogout } from '../_shared/gib.ts'

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const { username } = await req.json()
    if (!username) {
      return Response.json(
        { success: false, error: 'username zorunludur.' },
        { headers: corsHeaders },
      )
    }
    await gibLogout(username)
    return Response.json({ success: true }, { headers: corsHeaders })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'GIB oturumu kapatılamadı.'
    return Response.json({ success: false, error: message }, { headers: corsHeaders })
  }
})
