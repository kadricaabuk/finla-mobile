import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { createClient } from 'npm:@supabase/supabase-js'
import {
  filterGibInvoicesByFacts,
  filterInvoiceFacts,
  syncFactsForSession,
  type InvoiceFactRow,
} from '../_shared/invoice-facts.ts'
import { mapInvoicesToFacts } from '../_shared/invoice-mapper.ts'
import {
  getInvoiceProvider,
  providerContextFromSession,
} from '../_shared/invoice-provider/index.ts'
import { sortInvoicesByDate } from '../_shared/invoice-list-sort.ts'
import { requireFinlaSession, SessionAuthError } from '../_shared/session-auth.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const session = await requireFinlaSession(req)
    const body = await req.json() as {
      startDate?: string
      endDate?: string
      customerName?: string
      amountGte?: number
      amountEq?: number
      direction?: 'outgoing' | 'incoming'
    }
    const { startDate, endDate, customerName, amountGte, amountEq } = body
    const direction =
      body.direction === 'incoming' ? 'incoming' : 'outgoing'

    if (!startDate || !endDate) {
      return Response.json(
        { error: 'startDate ve endDate zorunludur.' },
        { status: 400, headers: corsHeaders },
      )
    }

    const provider = getInvoiceProvider()
    const ctx = providerContextFromSession(session)
    const scopeKey = session.userId
    const invoices =
      direction === 'incoming'
        ? await provider.listIncomingInvoices(ctx, startDate, endDate)
        : await provider.listOutgoingInvoices(ctx, startDate, endDate)
    const facts = mapInvoicesToFacts(scopeKey, invoices, direction).map((row) => ({
      ...row,
      user_id: session.userId,
      tenant_vkn: session.tenantVkn ?? null,
    }))
    if (facts.length > 0) {
      const { error: upsertError } = await supabase
        .from('invoice_facts')
        .upsert(facts, { onConflict: 'gib_username,invoice_uuid,direction' })
      if (upsertError) console.error('invoice_facts upsert failed', upsertError)
    }

    const filters = { customerName, amountGte, amountEq }
    const factRows = facts as InvoiceFactRow[]
    const hasFilters = Boolean(
      (typeof customerName === 'string' && customerName.trim().length > 0) ||
        (typeof amountGte === 'number' && Number.isFinite(amountGte)) ||
        (typeof amountEq === 'number' && Number.isFinite(amountEq)),
    )
    const matchedFacts = hasFilters
      ? filterInvoiceFacts(factRows, filters)
      : factRows
    const filteredInvoices = hasFilters
      ? filterGibInvoicesByFacts(invoices, matchedFacts)
      : invoices

    return Response.json({
      invoices: sortInvoicesByDate(
        filteredInvoices as Record<string, unknown>[],
      ),
      synced: facts.length,
    }, { headers: corsHeaders })
  } catch (err) {
    if (err instanceof SessionAuthError) {
      return Response.json({ error: err.message }, { status: err.status, headers: corsHeaders })
    }
    const message = err instanceof Error ? err.message : 'Faturalar getirilemedi.'
    return Response.json({ error: message }, { status: 500, headers: corsHeaders })
  }
})
