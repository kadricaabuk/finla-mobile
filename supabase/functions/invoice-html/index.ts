import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { getInvoiceProvider, providerContextFromSession } from '../_shared/invoice-provider/index.ts'
import {
  buildLocalPreviewFromRequest,
} from '../_shared/invoice-preview.ts'
import {
  loadPendingInvoice,
  type PendingInvoiceState,
} from '../_shared/invoice-workflow.ts'
import { requireFinlaSession, SessionAuthError } from '../_shared/session-auth.ts'
import { createClient } from 'npm:@supabase/supabase-js'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

type Body = {
  invoiceUuid?: string
  signed?: boolean
  draftDate?: string
  conversationId?: string
  direction?: 'outgoing' | 'incoming'
}

async function loadLocalPreviewFallback(
  userId: string,
  conversationId: string,
  invoiceUuid: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('conversations')
    .select('user_id, pending_invoice')
    .eq('id', conversationId)
    .single()
  if (error || !data) return null
  if (data.user_id !== userId) return null

  const pending = data.pending_invoice as PendingInvoiceState | null
  if (!pending?.request || pending.draft?.uuid !== invoiceUuid) return null
  return buildLocalPreviewFromRequest(pending.request).html ?? null
}

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const session = await requireFinlaSession(req)
    const body = ((await req.json().catch(() => ({}))) as Body) ?? {}
    const invoiceUuid = typeof body.invoiceUuid === 'string' ? body.invoiceUuid.trim() : ''
    const signed = Boolean(body.signed)
    const draftDate =
      typeof body.draftDate === 'string' ? body.draftDate.trim() : undefined
    const conversationId =
      typeof body.conversationId === 'string' ? body.conversationId.trim() : ''
    const direction =
      body.direction === 'incoming' ? 'incoming' : 'outgoing'
    if (!invoiceUuid) {
      return Response.json({ error: 'invoiceUuid zorunludur.' }, { status: 400, headers: corsHeaders })
    }

    const provider = getInvoiceProvider()
    const ctx = providerContextFromSession(session)

    try {
      const preview = await provider.getInvoicePreview(ctx, {
        invoiceUuid,
        signed,
        draftDate,
        direction,
      })
      return Response.json(preview, { headers: corsHeaders })
    } catch (previewErr) {
      if (conversationId && direction === 'outgoing') {
        const localHtml = await loadLocalPreviewFallback(
          session.userId,
          conversationId,
          invoiceUuid,
        )
        if (localHtml) {
          return Response.json({ html: localHtml, local_fallback: true }, {
            headers: corsHeaders,
          })
        }
      }
      throw previewErr
    }
  } catch (err) {
    if (err instanceof SessionAuthError) {
      return Response.json({ error: err.message }, { status: err.status, headers: corsHeaders })
    }
    console.error(err)
    const message = err instanceof Error ? err.message : 'Önizleme yüklenemedi.'
    return Response.json({ error: message }, { status: 500, headers: corsHeaders })
  }
})
