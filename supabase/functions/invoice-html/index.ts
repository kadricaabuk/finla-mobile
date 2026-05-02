import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { faturaGetInvoiceHtml } from '../_shared/gib.ts'
import { getSubjectFromAuthHeader, SessionAuthError } from '../_shared/session-auth.ts'

type Body = {
  invoiceUuid?: string
  signed?: boolean
}

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const username = await getSubjectFromAuthHeader(req)
    const body = ((await req.json().catch(() => ({}))) as Body) ?? {}
    const invoiceUuid = typeof body.invoiceUuid === 'string' ? body.invoiceUuid.trim() : ''
    const signed = Boolean(body.signed)
    if (!invoiceUuid) {
      return Response.json({ error: 'invoiceUuid zorunludur.' }, { status: 400, headers: corsHeaders })
    }

    const html = await faturaGetInvoiceHtml(username, invoiceUuid, signed)
    return Response.json({ html }, { headers: corsHeaders })
  } catch (err) {
    if (err instanceof SessionAuthError) {
      return Response.json({ error: err.message }, { status: err.status, headers: corsHeaders })
    }
    console.error(err)
    const message = err instanceof Error ? err.message : 'Önizleme yüklenemedi.'
    return Response.json({ error: message }, { status: 500, headers: corsHeaders })
  }
})
