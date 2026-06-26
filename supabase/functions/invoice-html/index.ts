import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { gibGetInvoicePreview } from '../_shared/gib.ts'
import { buildLocalDraftPreviewHtml } from '../_shared/invoice-mapper.ts'
import { getSubjectFromAuthHeader, SessionAuthError } from '../_shared/session-auth.ts'
import { createClient } from 'npm:@supabase/supabase-js'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

type Body = {
  invoiceUuid?: string
  signed?: boolean
  /** GİB fatura tarihi MM/DD/YYYY — taslak listesinde eşleşme için */
  draftDate?: string
  /** GİB önizlemesi patlarsa pending_invoice özeti için */
  conversationId?: string
}

type PendingRequest = {
  buyer_name?: string
  buyer_tax_id?: string
  date?: string
  currency?: string
  items?: Array<{
    name?: string
    quantity?: number
    unit?: string
    unit_price?: number
    vat_rate?: number
  }>
}

async function loadLocalPreviewFallback(
  username: string,
  conversationId: string,
  invoiceUuid: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('conversations')
    .select('gib_username, pending_invoice')
    .eq('id', conversationId)
    .single()
  if (error || !data) return null
  if (data.gib_username !== username) return null

  const pending = data.pending_invoice as {
    draft?: { uuid?: string }
    request?: PendingRequest
  } | null
  if (!pending?.request || pending.draft?.uuid !== invoiceUuid) return null
  return buildLocalDraftPreviewHtml(pending.request)
}

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const username = await getSubjectFromAuthHeader(req)
    const body = ((await req.json().catch(() => ({}))) as Body) ?? {}
    const invoiceUuid = typeof body.invoiceUuid === 'string' ? body.invoiceUuid.trim() : ''
    const signed = Boolean(body.signed)
    const draftDate =
      typeof body.draftDate === 'string' ? body.draftDate.trim() : undefined
    const conversationId =
      typeof body.conversationId === 'string' ? body.conversationId.trim() : ''
    if (!invoiceUuid) {
      return Response.json({ error: 'invoiceUuid zorunludur.' }, { status: 400, headers: corsHeaders })
    }

    try {
      const preview = await gibGetInvoicePreview(
        username,
        invoiceUuid,
        signed,
        draftDate,
      )
      return Response.json(preview, { headers: corsHeaders })
    } catch (previewErr) {
      if (conversationId) {
        const localHtml = await loadLocalPreviewFallback(
          username,
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
