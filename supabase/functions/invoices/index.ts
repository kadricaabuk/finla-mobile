import { loadFeatureFlags } from '../_shared/feature-config.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { createClient } from 'npm:@supabase/supabase-js'
import {
  faturaGetInvoicesIssuedToMe,
  faturaListInvoices,
  mapInvoicesToFacts,
} from '../_shared/gib.ts'
import { getSubjectFromAuthHeader, SessionAuthError } from '../_shared/session-auth.ts'
import { normalizeTurkish } from '../_shared/turkish.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const username = await getSubjectFromAuthHeader(req)
    const features = await loadFeatureFlags()
    const body = await req.json() as {
      startDate?: string
      endDate?: string
      customerName?: string
      amountGte?: number
      amountEq?: number
      /** outgoing = kestiğim; incoming = bana kesilen (gelen) */
      direction?: 'outgoing' | 'incoming'
    }
    const { startDate, endDate, customerName, amountGte, amountEq } = body
    const direction = body.direction === 'incoming' ? 'incoming' : 'outgoing'

    if (direction === 'outgoing' && !features.outgoingInvoices) {
      return Response.json(
        { error: 'Giden fatura listesi bu sürümde kapalı.' },
        { status: 403, headers: corsHeaders },
      )
    }
    if (direction === 'incoming' && !features.incomingInvoices) {
      return Response.json(
        { error: 'Gelen fatura listesi bu sürümde kapalı.' },
        { status: 403, headers: corsHeaders },
      )
    }

    if (!startDate || !endDate) {
      return Response.json(
        { error: 'startDate ve endDate zorunludur.' },
        { status: 400, headers: corsHeaders },
      )
    }

    const invoices = (
      direction === 'incoming'
        ? await faturaGetInvoicesIssuedToMe(username, startDate, endDate)
        : await faturaListInvoices(username, startDate, endDate)
    ) as unknown[]
    const facts = mapInvoicesToFacts(username, invoices, direction)
    if (facts.length > 0) {
      const { error: upsertError } = await supabase
        .from('invoice_facts')
        .upsert(facts, { onConflict: 'gib_username,invoice_uuid,direction' })
      if (upsertError) console.error('invoice_facts upsert failed', upsertError)
    }

    const hasCustomer = typeof customerName === 'string' && customerName.trim().length > 0
    const hasAmountGte = typeof amountGte === 'number' && Number.isFinite(amountGte)
    const hasAmountEq = typeof amountEq === 'number' && Number.isFinite(amountEq)

    let filteredInvoices = invoices
    if (hasCustomer || hasAmountGte || hasAmountEq) {
      const normalizedCustomer = hasCustomer ? normalizeTurkish(customerName) : ''
      const eqTolerance = 0.5
      const matched = facts
        .filter((f) => {
          if (hasCustomer) {
            const candidate = normalizeTurkish(f.customer_name ?? '')
            if (!candidate.includes(normalizedCustomer)) return false
          }
          const amount = f.gross_total ?? f.net_total ?? 0
          if (hasAmountGte && amount < amountGte) return false
          if (hasAmountEq && Math.abs(amount - amountEq) > eqTolerance) return false
          return true
        })
        .map((f) => f.invoice_uuid)
      const matchedSet = new Set(matched)
      filteredInvoices = (invoices as Array<Record<string, unknown>>).filter((i) => {
        const ettn = typeof i.ettn === 'string' ? i.ettn : ''
        const docNo = typeof i.belgeNumarasi === 'string' ? i.belgeNumarasi : ''
        return matchedSet.has(ettn) || matchedSet.has(docNo)
      })
    }

    return Response.json({ invoices: filteredInvoices, synced: facts.length }, { headers: corsHeaders })
  } catch (err) {
    if (err instanceof SessionAuthError) {
      return Response.json({ error: err.message }, { status: err.status, headers: corsHeaders })
    }
    const message = err instanceof Error ? err.message : 'Faturalar getirilemedi.'
    return Response.json({ error: message }, { status: 500, headers: corsHeaders })
  }
})
