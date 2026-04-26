import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { gibLogin } from '../_shared/gib.ts'

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

    await gibLogin(username, password)

    return Response.json({ success: true }, { headers: corsHeaders })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Giriş başarısız.'
    console.error('GIB login error:', message)
    return Response.json(
      { success: false, error: message },
      { headers: corsHeaders },
    )
  }
})
