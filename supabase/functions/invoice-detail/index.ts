import { createClient } from 'npm:@supabase/supabase-js'
import { loadFeatureFlags } from '../_shared/feature-config.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { faturaGetInvoiceHtml } from '../_shared/gib.ts'
import { getSubjectFromAuthHeader, SessionAuthError } from '../_shared/session-auth.ts'

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
      invoiceUuid?: string
      direction?: 'outgoing' | 'incoming'
    }
    const { invoiceUuid } = body
    const direction = body.direction === 'incoming' ? 'incoming' : 'outgoing'

    if (direction === 'outgoing' && !features.outgoingInvoices) {
      return Response.json(
        { error: 'Giden fatura detayı bu sürümde kapalı.' },
        { status: 403, headers: corsHeaders },
      )
    }
    if (direction === 'incoming' && !features.incomingInvoices) {
      return Response.json(
        { error: 'Gelen fatura detayı bu sürümde kapalı.' },
        { status: 403, headers: corsHeaders },
      )
    }

    if (!invoiceUuid) {
      return Response.json(
        { error: 'invoiceUuid zorunludur.' },
        { status: 400, headers: corsHeaders },
      )
    }

    const { data, error } = await supabase
      .from('invoice_facts')
      .select(
        'invoice_uuid, issue_date, status, currency, gross_total, vat_total, net_total, customer_tax_id, customer_name',
      )
      .eq('gib_username', username)
      .eq('invoice_uuid', invoiceUuid)
      .eq('direction', direction)
      .single()

    if (error) {
      return Response.json({ error: 'Fatura detayı bulunamadı.' }, { status: 404, headers: corsHeaders })
    }

    const parseMoney = (input: string): number | null => {
      const cleaned = input.replace(/[^\d,.-]/g, '').trim()
      if (!cleaned) return null
      const normalized = cleaned.includes(',') ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned
      const n = Number(normalized)
      return Number.isFinite(n) ? n : null
    }

    const parseTotalsFromHtml = (html: string) => {
      const plain = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
      const pick = (label: string): number | null => {
        // GIB çıktısında "Hesaplanan KDV(%20)" gibi etiket varyasyonları olabiliyor.
        const rx = new RegExp(`${label}[\\s\\S]{0,40}?([\\d\\.,]+)\\s*TL`, 'i')
        const m = plain.match(rx)
        return m ? parseMoney(m[1]) : null
      }
      const net = pick('Mal Hizmet Toplam Tutar')
      const vat = pick('Hesaplanan KDV')
      const gross = pick('Vergiler Dahil Toplam Tutar')
      return { net, vat, gross }
    }

    let invoice = data
    const needsTotals =
      invoice.gross_total == null || invoice.vat_total == null || invoice.net_total == null
    if (needsTotals) {
      const signed = String(invoice.status || '').toLowerCase().includes('approved')
      try {
        const html = await faturaGetInvoiceHtml(username, invoiceUuid, signed)
        const totals = parseTotalsFromHtml(html)
        invoice = {
          ...invoice,
          gross_total: invoice.gross_total ?? totals.gross,
          vat_total: invoice.vat_total ?? totals.vat,
          net_total: invoice.net_total ?? totals.net,
        }
        await supabase
          .from('invoice_facts')
          .update({
            gross_total: invoice.gross_total,
            vat_total: invoice.vat_total,
            net_total: invoice.net_total,
            synced_at: new Date().toISOString(),
          })
          .eq('gib_username', username)
          .eq('invoice_uuid', invoiceUuid)
          .eq('direction', direction)
      } catch {
        // Keep existing record when GIB HTML fetch fails.
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
