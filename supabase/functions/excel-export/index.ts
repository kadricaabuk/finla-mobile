import { createClient } from 'npm:@supabase/supabase-js'
import { loadFeatureFlags } from '../_shared/feature-config.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import {
  createInvoicesExcelExport,
  type InvoiceExportFilters,
} from '../_shared/invoices-excel-export.ts'
import {
  getSubjectFromAuthHeader,
  SessionAuthError,
} from '../_shared/session-auth.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

function parseAmount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const normalized = value.replace(/\./g, '').replace(',', '.').trim()
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const username = await getSubjectFromAuthHeader(req)
    const features = await loadFeatureFlags()
    const body = await req.json() as {
      startDate?: string
      endDate?: string
      direction?: 'outgoing' | 'incoming'
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

    const direction = body.direction === 'incoming' ? 'incoming' : 'outgoing'

    if (direction === 'outgoing' && !features.outgoingInvoices) {
      return Response.json(
        { error: 'Giden fatura dışa aktarma kapalı.' },
        { status: 403, headers: corsHeaders },
      )
    }
    if (direction === 'incoming' && !features.incomingInvoices) {
      return Response.json(
        { error: 'Gelen fatura dışa aktarma kapalı.' },
        { status: 403, headers: corsHeaders },
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
      direction,
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
