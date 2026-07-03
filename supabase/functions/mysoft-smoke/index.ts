import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { isMockMode } from '../_shared/invoice-provider/mock-provider.ts'
import { fetchMysoftAccessToken, mysoftRequest, mysoftRequestEnvelope } from '../_shared/mysoft-client.ts'
import { extractMysoftListRows, mysoftInboxListDateTimes, mysoftListQueryDateRange } from '../_shared/mysoft-mapper.ts'

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    if (isMockMode()) {
      return Response.json(
        {
          ok: false,
          mode: 'mock',
          message:
            'Mock mod aktif. Gerçek API testi için MYSOFT_MOCK=false ve creds tanımlayın.',
        },
        { headers: corsHeaders },
      )
    }

    const url = new URL(req.url)
    const tenant =
      url.searchParams.get('tenant')?.trim() || '6271036106'
    const start = url.searchParams.get('start')?.trim() || '2026-01-01'
    const end = url.searchParams.get('end')?.trim() || '2026-12-31'

    const token = await fetchMysoftAccessToken()
    const userInfo = await mysoftRequest<unknown>('/api/GeneralCard/getUserInfo', {
      method: 'GET',
    })
    const companyInfo = await mysoftRequest<unknown>(
      '/api/GeneralCard/getUserCompanyInfo',
      {
        method: 'GET',
        query: { tenantIdentifierNumber: tenant },
      },
    )

    const listEnvelope = await mysoftRequestEnvelope(
      '/api/InvoiceOutbox/getInvoiceOutboxWithHeaderInfoList',
      {
        method: 'POST',
        body: JSON.stringify({
          startDate: start,
          endDate: end,
          eDocumentType: null,
          afterValue: 0,
          limit: 0,
          tenantIdentifierNumber: tenant,
        }),
      },
    )

    const rows = extractMysoftListRows(listEnvelope)

    const range = mysoftListQueryDateRange(start, end)
    const inboxRange = mysoftInboxListDateTimes(start, end)
    const inboxBodyPeriod = {
      startDate: `${range.queryStart} 00:00:00`,
      endDate: `${range.queryEnd} 23:59:59`,
      afterValue: 0,
      limit: 500,
      tenantIdentifierNumber: tenant,
      isUseDocDate: true,
    }
    const inboxBodyHeader = {
      startDate: inboxRange.startDateTime,
      endDate: inboxRange.endDateTime,
      afterValue: 0,
      limit: 0,
      tenantIdentifierNumber: tenant,
    }

    const [inboxPeriodEnvelope, inboxHeaderEnvelope] = await Promise.all([
      mysoftRequestEnvelope(
        '/api/InvoiceInbox/getInvoiceInboxListForPeriod',
        { method: 'POST', body: JSON.stringify(inboxBodyPeriod) },
      ),
      mysoftRequestEnvelope(
        '/api/InvoiceInbox/getInvoiceInboxWithHeaderInfoListForPeriod',
        { method: 'POST', body: JSON.stringify(inboxBodyHeader) },
      ),
    ])

    const inboxPeriodRows = extractMysoftListRows(inboxPeriodEnvelope)
    const inboxHeaderRows = extractMysoftListRows(inboxHeaderEnvelope)
    const inboxRowsPreview = inboxHeaderRows.slice(0, 5).map((row) => ({
      docNo: row.docNo,
      accountName: row.accountName,
      vknTckn: row.vknTckn,
    }))

    return Response.json(
      {
        ok: true,
        mode: 'mysoft',
        token_preview: `${token.slice(0, 12)}…`,
        user_info: userInfo,
        company_info: companyInfo,
        list_probe: {
          tenant,
          start,
          end,
          row_count: rows.length,
          payload_keys: Object.keys(listEnvelope),
          data_preview: listEnvelope.data ?? null,
          sample_row: rows[0] ?? null,
        },
        inbox_probe: {
          query_range: range,
          period: {
            body: inboxBodyPeriod,
            row_count: inboxPeriodRows.length,
            payload_keys: Object.keys(inboxPeriodEnvelope),
            sample_row: inboxPeriodRows[0] ?? null,
          },
          header: {
            body: inboxBodyHeader,
            row_count: inboxHeaderRows.length,
            payload_keys: Object.keys(inboxHeaderEnvelope),
            sample_row: inboxHeaderRows[0] ?? null,
            rows_preview: inboxRowsPreview,
          },
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
