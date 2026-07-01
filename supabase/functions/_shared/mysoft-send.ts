import type { CreateInvoiceInput } from './invoice-mapper.ts'
import { mysoftRequest, mysoftRequestEnvelope } from './mysoft-client.ts'
import {
  buildMysoftInvoiceOutboxBody,
  extractMysoftEttn,
  extractMysoftListRows,
  trDateToMysoftDate,
} from './mysoft-mapper.ts'
import type { RecipientLookupResult } from './invoice-provider/types.ts'

export type TenantMysoftAliases = {
  gbAlias?: string
  pkAlias?: string
}

const GB_ALIAS_KEYS = [
  'gbAlias',
  'gb_alias',
  'defaultGbAlias',
  'defaultGb',
  'GbAlias',
]
const PK_ALIAS_KEYS = ['pkAlias', 'pk_alias', 'defaultPkAlias', 'PkAlias']

function pickStr(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const t = value.trim()
  return t.length > 0 ? t : undefined
}

function deepFindAlias(
  payload: unknown,
  keys: string[],
  depth = 0,
): string | undefined {
  if (depth > 8 || payload == null) return undefined
  if (typeof payload === 'string') return undefined
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = deepFindAlias(item, keys, depth + 1)
      if (found) return found
    }
    return undefined
  }
  if (typeof payload !== 'object') return undefined

  const row = payload as Record<string, unknown>
  for (const key of keys) {
    const found = pickStr(row[key])
    if (found) return found
  }
  for (const value of Object.values(row)) {
    const found = deepFindAlias(value, keys, depth + 1)
    if (found) return found
  }
  return undefined
}

async function fetchGbAliasFromRecentInvoice(
  tenantVkn: string,
): Promise<string | undefined> {
  const end = new Date()
  const start = new Date(end)
  start.setDate(start.getDate() - 120)

  const envelope = await mysoftRequestEnvelope(
    '/api/InvoiceOutbox/getInvoiceOutboxWithHeaderInfoList',
    {
      method: 'POST',
      body: JSON.stringify({
        startDate: trDateToMysoftDate(
          `${String(start.getDate()).padStart(2, '0')}/${String(start.getMonth() + 1).padStart(2, '0')}/${start.getFullYear()}`,
        ),
        endDate: trDateToMysoftDate(
          `${String(end.getDate()).padStart(2, '0')}/${String(end.getMonth() + 1).padStart(2, '0')}/${end.getFullYear()}`,
        ),
        eDocumentType: null,
        afterValue: 0,
        limit: 20,
        tenantIdentifierNumber: tenantVkn,
      }),
    },
  )

  for (const row of extractMysoftListRows(envelope)) {
    const gb = pickStr(row.gbAlias) ?? pickStr(row.gb_alias)
    if (gb) return gb
  }
  return undefined
}

/** Firma gönderici alias'ları (GİB imza için gbAlias gerekli olabilir). */
export async function fetchTenantMysoftAliases(
  tenantVkn: string,
): Promise<TenantMysoftAliases> {
  let gbAlias: string | undefined
  let pkAlias: string | undefined

  try {
    const company = await mysoftRequest<unknown>(
      '/api/GeneralCard/getUserCompanyInfo',
      {
        method: 'GET',
        query: { tenantIdentifierNumber: tenantVkn },
      },
    )
    gbAlias = deepFindAlias(company, GB_ALIAS_KEYS)
    pkAlias = deepFindAlias(company, PK_ALIAS_KEYS)
  } catch {
    // company info opsiyonel
  }

  if (!gbAlias) {
    try {
      const gib = await mysoftRequest<unknown>(
        '/api/GeneralCard/getGibAccountModel',
        { method: 'GET', query: { vknTckn: tenantVkn } },
      )
      gbAlias = deepFindAlias(gib, GB_ALIAS_KEYS)
      pkAlias = pkAlias ?? deepFindAlias(gib, PK_ALIAS_KEYS)
    } catch {
      // gib lookup opsiyonel
    }
  }

  if (!gbAlias) {
    try {
      gbAlias = await fetchGbAliasFromRecentInvoice(tenantVkn)
    } catch {
      // liste fallback opsiyonel
    }
  }

  const envGb = Deno.env.get('MYSOFT_DEFAULT_GB_ALIAS')?.trim()
  if (!gbAlias && envGb) gbAlias = envGb

  return { gbAlias, pkAlias }
}

/** Taslak faturayı GİB'e gönderir (Mysoft: GET/POST + gbAlias varyantları). */
export async function sendMysoftDraftToGib(
  ettn: string,
  tenantVkn: string,
  aliases?: TenantMysoftAliases,
): Promise<void> {
  const path = '/api/InvoiceOutbox/sendDraftInvoiceToGIB'
  const errors: string[] = []
  const gbAlias = aliases?.gbAlias

  const queryBase: Record<string, string> = {
    invoiceETTN: ettn,
    tenantIdentifierNumber: tenantVkn,
  }
  const bodyBase: Record<string, string> = {
    invoiceETTN: ettn,
    tenantIdentifierNumber: tenantVkn,
  }

  const attempts: Array<() => Promise<unknown>> = []

  if (gbAlias) {
    attempts.push(
      () =>
        mysoftRequest(path, {
          method: 'GET',
          query: { ...queryBase, gbAlias },
        }),
      () =>
        mysoftRequest(path, {
          method: 'POST',
          body: JSON.stringify({ ...bodyBase, gbAlias }),
        }),
    )
  }

  attempts.push(
    () => mysoftRequest(path, { method: 'GET', query: queryBase }),
    () =>
      mysoftRequest(path, {
        method: 'POST',
        body: JSON.stringify(bodyBase),
      }),
    () =>
      mysoftRequest(path, {
        method: 'POST',
        body: JSON.stringify({ ettn, tenantIdentifierNumber: tenantVkn }),
      }),
    () =>
      mysoftRequest(path, {
        method: 'GET',
        query: { ettn, tenantIdentifierNumber: tenantVkn },
      }),
  )

  for (const attempt of attempts) {
    try {
      await attempt()
      return
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err))
    }
  }

  throw new Error(errors[errors.length - 1] ?? 'sendDraftInvoiceToGIB başarısız')
}

/** Taslak gönderimi başarısızsa aynı ETTN ile doğrudan invoiceOutbox (isSaveAsDraft: false). */
export async function resendMysoftOutboxToGib(
  input: CreateInvoiceInput,
  tenantVkn: string,
  ettn: string,
  recipient: RecipientLookupResult | null,
  aliases?: TenantMysoftAliases,
): Promise<void> {
  const body = buildMysoftInvoiceOutboxBody(
    input,
    tenantVkn,
    recipient,
    {
      isSaveAsDraft: false,
      ettn,
      gbAlias: aliases?.gbAlias,
    },
  )

  const created = await mysoftRequest<unknown>(
    '/api/InvoiceOutbox/invoiceOutbox',
    { method: 'POST', body: JSON.stringify(body) },
  )

  const returnedEttn = extractMysoftEttn(created)
  if (returnedEttn && returnedEttn.toLowerCase() !== ettn.toLowerCase()) {
    console.warn(
      JSON.stringify({
        event: 'mysoft_resend_ettn_mismatch',
        expected: ettn,
        returned: returnedEttn,
      }),
    )
  }
}
