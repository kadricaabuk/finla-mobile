import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { gibListInvoices } from '../_shared/gib.ts'

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const { username, password, startDate, endDate } = await req.json()

    if (!username || !password || !startDate || !endDate) {
      return Response.json(
        { error: 'username, password, startDate ve endDate zorunludur.' },
        { status: 400, headers: corsHeaders },
      )
    }

    const invoices = await gibListInvoices(username, password, startDate, endDate)

    return Response.json({ invoices }, { headers: corsHeaders })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Faturalar getirilemedi.'
    return Response.json({ error: message }, { status: 500, headers: corsHeaders })
  }
})
