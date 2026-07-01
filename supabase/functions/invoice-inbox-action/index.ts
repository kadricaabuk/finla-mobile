import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { incomingFactStatusLabel } from '../_shared/incoming-invoice-status.ts'
import {
  getInvoiceProvider,
  isMockMode,
  providerContextFromSession,
} from '../_shared/invoice-provider/index.ts'
import { requireFinlaSession, SessionAuthError } from '../_shared/session-auth.ts'
import { createClient } from 'npm:@supabase/supabase-js'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

type Body = {
  invoiceUuid?: string
  action?: 'accept' | 'reject'
  rejectReason?: string
}

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const session = await requireFinlaSession(req)
    const body = (await req.json().catch(() => ({}))) as Body
    const invoiceUuid =
      typeof body.invoiceUuid === 'string' ? body.invoiceUuid.trim() : ''
    const action = body.action

    if (!invoiceUuid) {
      return Response.json(
        { error: 'invoiceUuid zorunludur.' },
        { status: 400, headers: corsHeaders },
      )
    }
    if (action !== 'accept' && action !== 'reject') {
      return Response.json(
        { error: 'action accept veya reject olmalıdır.' },
        { status: 400, headers: corsHeaders },
      )
    }
    if (isMockMode()) {
      return Response.json(
        { error: 'Gelen fatura yanıtı mock modda desteklenmiyor.' },
        { status: 400, headers: corsHeaders },
      )
    }

    const provider = getInvoiceProvider()
    const ctx = providerContextFromSession(session)

    if (action === 'accept') {
      await provider.acceptIncomingInvoice(ctx, invoiceUuid)
    } else {
      await provider.rejectIncomingInvoice(
        ctx,
        invoiceUuid,
        typeof body.rejectReason === 'string' ? body.rejectReason : '',
      )
    }

    const factStatus = action === 'accept' ? 'accepted' : 'rejected'
    const { error: dbError } = await supabase
      .from('invoice_facts')
      .update({
        status: factStatus,
        synced_at: new Date().toISOString(),
      })
      .eq('gib_username', session.userId)
      .eq('invoice_uuid', invoiceUuid)
      .eq('direction', 'incoming')

    if (dbError) {
      console.error('invoice_facts status update failed', dbError)
    }

    return Response.json(
      {
        ok: true,
        status: factStatus,
        status_label: incomingFactStatusLabel(factStatus),
      },
      { headers: corsHeaders },
    )
  } catch (err) {
    if (err instanceof SessionAuthError) {
      return Response.json({ error: err.message }, {
        status: err.status,
        headers: corsHeaders,
      })
    }
    const message = err instanceof Error
      ? err.message
      : 'Gelen fatura yanıtı gönderilemedi.'
    return Response.json({ error: message }, {
      status: 500,
      headers: corsHeaders,
    })
  }
})
