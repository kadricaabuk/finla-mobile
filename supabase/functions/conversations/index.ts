import { createClient } from 'npm:@supabase/supabase-js'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import {
  conversationOwnedByUser,
  isValidConversationId,
} from '../_shared/conversation-access.ts'
import { requireFinlaSession, SessionAuthError } from '../_shared/session-auth.ts'

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
    const session = await requireFinlaSession(req)
    const body = (await req.json().catch(() => ({}))) as Body
    const action = typeof body.action === 'string' ? body.action.trim() : ''

    if (action === 'list') {
      const { data, error } = await supabase
        .from('conversations')
        .select('id,title,created_at')
        .eq('user_id', session.userId)
        .is('deleted_at', null)
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
        !isValidConversationId(conversationId)
      ) {
        throw new SessionAuthError('conversationId geçersiz.', 400)
      }

      const owned = await conversationOwnedByUser(
        supabase,
        conversationId,
        session.userId,
      )
      if (!owned) {
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

    if (action === 'delete') {
      const conversationId =
        typeof body.conversationId === 'string' ? body.conversationId.trim() : ''
      if (
        !conversationId ||
        !isValidConversationId(conversationId)
      ) {
        throw new SessionAuthError('conversationId geçersiz.', 400)
      }

      const owned = await conversationOwnedByUser(
        supabase,
        conversationId,
        session.userId,
      )
      if (!owned) {
        throw new SessionAuthError('Sohbet bulunamadı.', 404)
      }

      // Soft delete: rows are never removed; reads filter on deleted_at is null.
      const { error: delErr } = await supabase
        .from('conversations')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', conversationId)
        .eq('user_id', session.userId)

      if (delErr) throw delErr
      return Response.json({ ok: true }, { headers: corsHeaders })
    }

    return Response.json(
      { error: 'Bilinmeyen action; list, messages veya delete kullanın.' },
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
