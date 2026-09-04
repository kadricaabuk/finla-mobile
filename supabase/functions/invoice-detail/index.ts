import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { createClient } from 'npm:@supabase/supabase-js'
import {
  getInvoiceProvider,
  providerContextFromSession,
} from '../_shared/invoice-provider/index.ts'
import { isMockMode } from '../_shared/invoice-provider/mock-provider.ts'
import { fetchMysoftIncomingInvoiceDetail } from '../_shared/mysoft-invoice-detail.ts'
import { parseTotalsFromHtml } from '../_shared/parse-invoice-html-totals.ts'
import { requireFinlaSession, SessionAuthError } from '../_shared/session-auth.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

type InvoiceDetailRow = {
  invoice_uuid: string
  issue_date: string | null
  status: string
  currency: string
  gross_total: number | null
  vat_total: number | null
  net_total: number | null
  customer_tax_id: string | null
  customer_name: string | null
}

function isBadDisplayName(name: string | null | undefined): boolean {
  if (!name?.trim()) return true
  return name.trim().startsWith('urn:mail:')
}

async function loadFactFromDb(
  scopeKey: string,
  invoiceUuid: string,
  direction: 'outgoing' | 'incoming',
): Promise<InvoiceDetailRow | null> {
  const { data, error } = await supabase
    .from('invoice_facts')
    .select(
      'invoice_uuid, issue_date, status, currency, gross_total, vat_total, net_total, customer_tax_id, customer_name',
    )
    .eq('gib_username', scopeKey)
    .eq('invoice_uuid', invoiceUuid)
    .eq('direction', direction)
    .maybeSingle()

  if (error || !data) return null
  return data as InvoiceDetailRow
}

async function persistFact(
  session: Awaited<ReturnType<typeof requireFinlaSession>>,
  invoice: InvoiceDetailRow,
  direction: 'outgoing' | 'incoming',
): Promise<void> {
  const { error } = await supabase.from('invoice_facts').upsert(
    {
      gib_username: session.userId,
      user_id: session.userId,
      tenant_vkn: session.tenantVkn ?? null,
      invoice_uuid: invoice.invoice_uuid,
      direction,
      issue_date: invoice.issue_date,
      status: invoice.status,
      currency: invoice.currency,
      gross_total: invoice.gross_total,
      vat_total: invoice.vat_total,
      net_total: invoice.net_total,
      customer_tax_id: invoice.customer_tax_id,
      customer_name: invoice.customer_name,
      synced_at: new Date().toISOString(),
    },
    { onConflict: 'gib_username,invoice_uuid,direction' },
  )
  if (error) console.error('invoice_facts upsert from detail failed', error)
}

async function fetchDetailFromProvider(
  session: Awaited<ReturnType<typeof requireFinlaSession>>,
  invoiceUuid: string,
  direction: 'outgoing' | 'incoming',
): Promise<InvoiceDetailRow> {
  const ctx = providerContextFromSession(session)

  if (direction === 'incoming') {
    if (isMockMode()) {
      return {
        invoice_uuid: invoiceUuid,
        issue_date: null,
        status: 'pending_response',
        currency: 'TRY',
        gross_total: 590,
        vat_total: 90,
        net_total: 500,
        customer_tax_id: '9876543210',
        customer_name: 'Tedarikçi A.Ş.',
      }
    }
    return await fetchMysoftIncomingInvoiceDetail(ctx, invoiceUuid)
  }

  const provider = getInvoiceProvider()
  const preview = await provider.getInvoicePreview(ctx, {
    invoiceUuid,
    signed: true,
  })
  const html = preview.html ?? ''
  const totals = html ? parseTotalsFromHtml(html) : { net: null, vat: null, gross: null }

  return {
    invoice_uuid: invoiceUuid,
    issue_date: null,
    status: 'approved',
    currency: 'TRY',
    gross_total: totals.gross,
    vat_total: totals.vat,
    net_total: totals.net,
    customer_tax_id: null,
    customer_name: null,
  }
}

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const session = await requireFinlaSession(req)
    const scopeKey = session.userId
    const body = await req.json() as {
      invoiceUuid?: string
      direction?: 'outgoing' | 'incoming'
    }
    const { invoiceUuid } = body
    const direction =
      body.direction === 'incoming' ? 'incoming' : 'outgoing'

    if (!invoiceUuid) {
      return Response.json(
        { error: 'invoiceUuid zorunludur.' },
        { status: 400, headers: corsHeaders },
      )
    }

    let invoice =
      await loadFactFromDb(scopeKey, invoiceUuid, direction)

    if (!invoice) {
      try {
        invoice = await fetchDetailFromProvider(session, invoiceUuid, direction)
        await persistFact(session, invoice, direction)
      } catch (err) {
        const message = err instanceof Error
          ? err.message
          : 'Fatura detayı bulunamadı.'
        return Response.json({ error: message }, {
          status: 404,
          headers: corsHeaders,
        })
      }
    }

    const needsTotals =
      invoice.gross_total == null ||
      invoice.vat_total == null ||
      invoice.net_total == null
    const needsIncomingRefresh =
      direction === 'incoming' &&
      !isMockMode() &&
      (needsTotals ||
        isBadDisplayName(invoice.customer_name) ||
        invoice.status === 'unknown')

    if (needsTotals && direction === 'outgoing') {
      try {
        const provider = getInvoiceProvider()
        const preview = await provider.getInvoicePreview(
          providerContextFromSession(session),
          { invoiceUuid, signed: true },
        )
        const html = preview.html ?? ''
        if (html) {
          const totals = parseTotalsFromHtml(html)
          invoice = {
            ...invoice,
            gross_total: invoice.gross_total ?? totals.gross,
            vat_total: invoice.vat_total ?? totals.vat,
            net_total: invoice.net_total ?? totals.net,
          }
          await persistFact(session, invoice, direction)
        }
      } catch {
        // Mevcut kayıt ile devam et.
      }
    }

    if (needsIncomingRefresh) {
      try {
        const fresh = await fetchMysoftIncomingInvoiceDetail(
          providerContextFromSession(session),
          invoiceUuid,
        )
        invoice = {
          ...invoice,
          status: fresh.status ?? invoice.status,
          issue_date: fresh.issue_date ?? invoice.issue_date,
          customer_name: isBadDisplayName(invoice.customer_name)
            ? fresh.customer_name
            : invoice.customer_name,
          customer_tax_id: invoice.customer_tax_id ?? fresh.customer_tax_id,
          gross_total: invoice.gross_total ?? fresh.gross_total,
          vat_total: invoice.vat_total ?? fresh.vat_total,
          net_total: invoice.net_total ?? fresh.net_total,
          currency: invoice.currency || fresh.currency,
        }
        await persistFact(session, invoice, direction)
      } catch {
        // Mevcut kayıt ile devam et.
      }
    }

    return Response.json({ invoice }, { headers: corsHeaders })
  } catch (err) {
    if (err instanceof SessionAuthError) {
      return Response.json({ error: err.message }, { status: err.status, headers: corsHeaders })
    }
    const message = err instanceof Error ? err.message : 'Beklenmeyen bir hata oluştu.'
    return Response.json({ error: message }, { status: 500, headers: corsHeaders })
  }
})
