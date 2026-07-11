import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { resolveTenantProvider } from '../_shared/invoice-provider/resolve.ts'
import { createNilveraClient } from '../_shared/invoice-provider/nilvera/nilvera-client.ts'

interface NilveraPage<T> {
  Content?: T[]
  TotalCount?: number
  TotalPages?: number
}

/**
 * Nilvera connectivity smoke test. Unlike Mysoft, there's no global env
 * credential — each tenant carries its own Nilvera API key, so ?tenant=<VKN>
 * is required and that tenant's provider must already be set to 'nilvera' by the CRM.
 *
 * Example: /nilvera-smoke?tenant=1234567890&start=2026-01-01&end=2026-12-31&check_vkn=6271036106
 */
Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const url = new URL(req.url)
    const tenant = url.searchParams.get('tenant')?.trim()
    if (!tenant) {
      return Response.json(
        {
          ok: false,
          error: 'tenant (VKN/TCKN) query parametresi zorunlu.',
        },
        { status: 400, headers: corsHeaders },
      )
    }

    const start = url.searchParams.get('start')?.trim() || '2026-01-01'
    const end = url.searchParams.get('end')?.trim() || '2026-12-31'
    const checkVkn = url.searchParams.get('check_vkn')?.trim() || '6271036106'

    const cfg = await resolveTenantProvider(tenant)
    if (cfg.provider !== 'nilvera' || !cfg.nilvera) {
      return Response.json(
        {
          ok: false,
          error:
            `Tenant ${tenant} şu an '${cfg.provider}' sağlayıcısında. Nilvera testi için CRM'den ` +
            `tenants.provider = 'nilvera' yap ve tenant_provider_credentials'a API anahtarı ekle.`,
        },
        { headers: corsHeaders },
      )
    }

    const client = createNilveraClient({ apiKey: cfg.nilvera.apiKey })

    const company = await client.request<Record<string, unknown>>('/general/Company', {
      method: 'GET',
    })

    const taxpayerCheck = await client.request<Record<string, unknown>[]>(
      '/general/GlobalCompany/Check/TaxNumber/' + encodeURIComponent(checkVkn),
      { method: 'GET' },
    )

    const saleList = await client.request<NilveraPage<Record<string, unknown>>>(
      '/einvoice/Sale',
      {
        method: 'GET',
        query: { Page: 1, PageSize: 10, StartDate: start, EndDate: end },
      },
    )
    const purchaseList = await client.request<NilveraPage<Record<string, unknown>>>(
      '/einvoice/Purchase',
      {
        method: 'GET',
        query: { Page: 1, PageSize: 10, StartDate: start, EndDate: end },
      },
    )

    return Response.json(
      {
        ok: true,
        mode: 'nilvera',
        environment: cfg.nilvera.environment,
        company,
        taxpayer_check: {
          vkn: checkVkn,
          row_count: Array.isArray(taxpayerCheck) ? taxpayerCheck.length : 0,
          sample: Array.isArray(taxpayerCheck) ? taxpayerCheck[0] ?? null : null,
        },
        sale_probe: {
          start,
          end,
          total_count: saleList?.TotalCount ?? null,
          row_count: saleList?.Content?.length ?? 0,
          sample_row: saleList?.Content?.[0] ?? null,
        },
        purchase_probe: {
          start,
          end,
          total_count: purchaseList?.TotalCount ?? null,
          row_count: purchaseList?.Content?.length ?? 0,
          sample_row: purchaseList?.Content?.[0] ?? null,
        },
      },
      { headers: corsHeaders },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Smoke test başarısız.'
    return Response.json({ ok: false, error: message }, {
      status: 500,
      headers: corsHeaders,
    })
  }
})
