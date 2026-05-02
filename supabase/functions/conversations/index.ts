import { createClient } from 'npm:@supabase/supabase-js'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { getSubjectFromAuthHeader, SessionAuthError } from '../_shared/session-auth.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

type Body = {
  action?: string
  conversationId?: string
}

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') {
    return Response.json({ error: 'Method Not Allowed' }, { status: 405, headers: corsHeaders })
  }

  try {
    const username = await getSubjectFromAuthHeader(req)
    const body = (await req.json().catch(() => ({}))) as Body
    const action = typeof body.action === 'string' ? body.action.trim() : ''

    if (action === 'list') {
      const { data, error } = await supabase
        .from('conversations')
        .select('id,title,created_at')
        .eq('gib_username', username)
        .order('created_at', { ascending: false })
        .limit(80)

      if (error) throw error
      return Response.json({ conversations: data ?? [] }, { headers: corsHeaders })
    }

    if (action === 'messages') {
      const conversationId =
        typeof body.conversationId === 'string' ? body.conversationId.trim() : ''
      if (
        !conversationId ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          conversationId,
        )
      ) {
        throw new SessionAuthError('conversationId geçersiz.', 400)
      }

      const { data: conv, error: convErr } = await supabase
        .from('conversations')
        .select('id')
        .eq('id', conversationId)
        .eq('gib_username', username)
        .maybeSingle()

      if (convErr) throw convErr
      if (!conv?.id) {
        throw new SessionAuthError('Sohbet bulunamadı.', 404)
      }

      const { data: rows, error: msgErr } = await supabase
        .from('messages')
        .select('id,role,content,created_at,action_snapshot')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })

      if (msgErr) throw msgErr
      return Response.json({ messages: rows ?? [] }, { headers: corsHeaders })
    }

    return Response.json(
      { error: 'Bilinmeyen action; list veya messages kullanın.' },
      { status: 400, headers: corsHeaders },
    )
  } catch (err) {
    if (err instanceof SessionAuthError) {
      return Response.json({ error: err.message }, { status: err.status, headers: corsHeaders })
    }
    console.error(err)
    const message = err instanceof Error ? err.message : 'Konuşmalar getirilemedi.'
    return Response.json({ error: message }, { status: 500, headers: corsHeaders })
  }
})
