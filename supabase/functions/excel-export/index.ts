import { createClient } from 'npm:@supabase/supabase-js'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import {
  createInvoicesExcelExport,
  type InvoiceExportFilters,
} from '../_shared/invoices-excel-export.ts'
import { parseAmount } from '../_shared/invoice-facts.ts'
import {
  getSubjectFromAuthHeader,
  SessionAuthError,
} from '../_shared/session-auth.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const username = await getSubjectFromAuthHeader(req)
    const body = await req.json() as {
      startDate?: string
      endDate?: string
      customerName?: string
      amountGte?: number | string
      amountEq?: number | string
    }

    const { startDate, endDate } = body
    if (!startDate || !endDate) {
      return Response.json(
        { error: 'startDate ve endDate zorunludur (GG/AA/YYYY).' },
        { status: 400, headers: corsHeaders },
      )
    }

    const filters: InvoiceExportFilters = {}
    if (typeof body.customerName === 'string' && body.customerName.trim()) {
      filters.customerName = body.customerName.trim()
    }
    const amountGte = parseAmount(body.amountGte ?? null)
    const amountEq = parseAmount(body.amountEq ?? null)
    if (amountGte != null) filters.amountGte = amountGte
    if (amountEq != null) filters.amountEq = amountEq

    const result = await createInvoicesExcelExport({
      supabase,
      username,
      startDateTr: startDate,
      endDateTr: endDate,
      direction: 'outgoing',
      filters,
    })

    return Response.json(result, { headers: corsHeaders })
  } catch (err) {
    if (err instanceof SessionAuthError) {
      return Response.json(
        { error: err.message },
        { status: err.status, headers: corsHeaders },
      )
    }
    const message =
      err instanceof Error ? err.message : 'Excel oluşturulamadı.'
    console.error('excel-export', err)
    return Response.json({ error: message }, { status: 500, headers: corsHeaders })
  }
})
