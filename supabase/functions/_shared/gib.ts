import { createFaturaClient } from 'npm:fatura'

const env = Deno.env.get('GIB_ENV') === 'TEST' ? 'TEST' : 'PROD'
const BASE =
  env === 'TEST'
    ? 'https://earsivportaltest.efatura.gov.tr'
    : 'https://earsivportal.efatura.gov.tr'

export interface InvoiceLineItem {
  name: string
  quantity: number
  unit: string
  unitPrice: number
  vatRate: number
}

export interface CreateInvoiceInput {
  buyerName: string
  buyerTaxId?: string
  buyerAddress?: string
  items: InvoiceLineItem[]
  date?: string
  currency?: string
}

export interface InvoiceDraftRef {
  date: string
  uuid: string
}

export interface InvoiceFactRow {
  gib_username: string
  invoice_uuid: string
  issue_date: string | null
  status: string
  currency: string
  gross_total: number | null
  vat_total: number | null
  net_total: number | null
  customer_tax_id: string | null
  customer_name: string | null
  raw_payload: Record<string, unknown>
}

function todayFormatted(): string {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function nowTimeFormatted(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

function buildInvoiceDetails(input: CreateInvoiceInput) {
  const items = input.items.map(item => {
    const totalAmount = item.quantity * item.unitPrice
    const vatAmount = Math.round(totalAmount * item.vatRate) / 100
    return {
      name: item.name,
      quantity: item.quantity,
      unitType: item.unit || 'ADET',
      unitPrice: item.unitPrice,
      price: totalAmount,
      VATRate: item.vatRate,
      VATAmount: vatAmount,
      VATAmountOfTax: 0,
    }
  })
  const grandTotal = items.reduce((s, i) => s + i.price, 0)
  const totalVAT = items.reduce((s, i) => s + i.VATAmount, 0)
  return {
    date: input.date || todayFormatted(),
    time: nowTimeFormatted(),
    currency: input.currency || 'TRY',
    taxIDOrTRID: input.buyerTaxId || '11111111111',
    title: input.buyerName,
    fullAddress: input.buyerAddress || '',
    taxOffice: 'ISTANBUL',
    items,
    grandTotal,
    totalVAT,
    grandTotalInclVAT: grandTotal + totalVAT,
    paymentTotal: grandTotal + totalVAT,
  }
}

function normalizeMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.toLocaleLowerCase('tr-TR')
}

export type GibAuthErrorCode =
  | 'MULTI_SESSION_PERSISTED'
  | 'BAD_CREDENTIALS'
  | 'GIB_TEMPORARY'
  | 'UNKNOWN'

export interface GibAuthTraceEntry {
  step: string
  attempt: number
  endpoint?: string
  message: string
  ts: string
}

export class GibAuthError extends Error {
  code: GibAuthErrorCode
  trace: GibAuthTraceEntry[]

  constructor(message: string, code: GibAuthErrorCode, trace: GibAuthTraceEntry[] = []) {
    super(message)
    this.name = 'GibAuthError'
    this.code = code
    this.trace = trace
  }
}

function addTrace(
  trace: GibAuthTraceEntry[],
  step: string,
  attempt: number,
  message: string,
  endpoint?: string,
): void {
  trace.push({
    step,
    attempt,
    endpoint,
    message: message.slice(0, 280),
    ts: new Date().toISOString(),
  })
}

function isMultiSessionError(err: unknown): boolean {
  const msg = normalizeMessage(err)
  return (
    msg.includes('önce güvenli çıkış yapın') ||
    msg.includes('once guvenli cikis yapin') ||
    msg.includes('birden fazla') ||
    msg.includes('multiple') ||
    msg.includes('oturum')
  )
}

function isBadCredentialsError(err: unknown): boolean {
  const msg = normalizeMessage(err)
  return (
    msg.includes('şifre') ||
    msg.includes('sifre') ||
    msg.includes('parola') ||
    msg.includes('kullanıcı adı') ||
    msg.includes('kullanici adi') ||
    msg.includes('hatalı') ||
    msg.includes('hatali')
  )
}

function isRecoverableAuthError(err: unknown): boolean {
  const msg = normalizeMessage(err)
  return (
    msg.includes('clientip') ||
    msg.includes('oturum geçersiz') ||
    msg.includes('oturum gecersiz') ||
    msg.includes('session invalid') ||
    msg.includes('token') ||
    msg.includes('yetkisiz') ||
    msg.includes('unauthorized')
  )
}

function classifyAuthError(err: unknown): GibAuthErrorCode {
  if (isMultiSessionError(err)) return 'MULTI_SESSION_PERSISTED'
  if (isBadCredentialsError(err)) return 'BAD_CREDENTIALS'
  if (isRecoverableAuthError(err)) return 'GIB_TEMPORARY'
  return 'UNKNOWN'
}

async function callLogoutVariant(
  endpoint: string,
  body: URLSearchParams,
  trace: GibAuthTraceEntry[],
  attempt: number,
): Promise<void> {
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: body.toString(),
    })
    const txt = await res.text()
    addTrace(trace, 'logout_variant', attempt, `status=${res.status} body=${txt}`, endpoint)
  } catch (err) {
    addTrace(
      trace,
      'logout_variant_error',
      attempt,
      err instanceof Error ? err.message : String(err),
      endpoint,
    )
  }
}

async function forceLogoutByUser(
  username: string,
  trace: GibAuthTraceEntry[] = [],
  attempt = 0,
): Promise<void> {
  const requests: Promise<void>[] = []
  const params = (assoscmd: 'logout' | 'anologin') =>
    new URLSearchParams({
      assoscmd,
      rtype: 'json',
      userid: username,
      token: '',
    })

  // Wave 1: known working variants (assos-sign is 405 on PROD).
  if (env === 'TEST') {
    requests.push(
      callLogoutVariant(
        `${BASE}/earsiv-services/assos-sign`,
        params('logout'),
        trace,
        attempt,
      ),
    )
  }
  requests.push(
    callLogoutVariant(
      `${BASE}/earsiv-services/assos-login`,
      params('logout'),
      trace,
      attempt,
    ),
  )
  requests.push(
    callLogoutVariant(
      `${BASE}/earsiv-services/assos-login`,
      params('anologin'),
      trace,
      attempt,
    ),
  )
  await Promise.allSettled(requests)

  // Wave 2: repeat after a short wait only for login recovery use-cases.
  await sleep(1200)
  await Promise.allSettled([
    callLogoutVariant(
      `${BASE}/earsiv-services/assos-login`,
      params('anologin'),
      trace,
      attempt,
    ),
    callLogoutVariant(
      `${BASE}/earsiv-services/assos-login`,
      params('logout'),
      trace,
      attempt,
    ),
  ])
}

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms))
}

async function getTokenWithRecovery(
  client: ReturnType<typeof createFaturaClient>,
  username: string,
  password: string,
  trace: GibAuthTraceEntry[] = [],
): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const token = await client.getToken(username, password)
      addTrace(trace, 'get_token_ok', attempt, 'token alindi')
      return token
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      addTrace(trace, 'get_token_error', attempt, message)
      if (!isMultiSessionError(err)) throw err
      if (attempt === 2) throw err

      addTrace(trace, 'multi_session_recovery', attempt, 'forced logout basliyor')
      await forceLogoutByUser(username, trace, attempt)
      await sleep(2000 + attempt * 1500)
    }
  }
  throw new Error('GIB oturum açılamadı.')
}

// Runs fn inside a single request-local GİB session.
// This avoids cross-request token reuse that can trigger clientIP/session errors.
async function withSession<T>(
  username: string,
  password: string,
  fn: (client: ReturnType<typeof createFaturaClient>, token: string) => Promise<T>,
): Promise<T> {
  const client = createFaturaClient(env)
  let token: string | null = null

  try {
    token = await getTokenWithRecovery(client, username, password)
    return await fn(client, token)
  } catch (err) {
    if (!token || !isRecoverableAuthError(err)) throw err

    console.log('GIB session rejected; refreshing token once')
    await client.logout(token).catch(() => {})
    token = await getTokenWithRecovery(client, username, password)
    return await fn(client, token)
  } finally {
    if (token) {
      await client.logout(token).catch(() => {})
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function gibLogin(username: string, password: string): Promise<void> {
  // Validate credentials with a short-lived login, then close session.
  const client = createFaturaClient(env)
  const trace: GibAuthTraceEntry[] = []
  let token: string | null = null
  try {
    token = await getTokenWithRecovery(client, username, password, trace)
  } finally {
    if (token) await client.logout(token).catch(() => {})
  }
}

export async function gibLoginWithTrace(
  username: string,
  password: string,
): Promise<{ trace: GibAuthTraceEntry[] }> {
  const client = createFaturaClient(env)
  const trace: GibAuthTraceEntry[] = []
  let token: string | null = null

  try {
    token = await getTokenWithRecovery(client, username, password, trace)
    return { trace }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'GİB girişi başarısız.'
    const code = classifyAuthError(err)
    addTrace(trace, 'login_failed', 0, message)
    throw new GibAuthError(message, code, trace)
  } finally {
    if (token) {
      await client.logout(token).catch((logoutErr: unknown) => {
        addTrace(
          trace,
          'logout_after_login_error',
          0,
          logoutErr instanceof Error ? logoutErr.message : String(logoutErr),
        )
      })
    }
  }
}

export async function gibLogout(username: string): Promise<void> {
  // Best-effort remote session cleanup without local cache state.
  await forceLogoutByUser(username)
}

export async function gibCreateInvoice(
  username: string,
  password: string,
  input: CreateInvoiceInput,
) {
  return withSession(username, password, (client, token) =>
    client.createDraftInvoice(token, buildInvoiceDetails(input)),
  )
}

export async function gibCreateInvoicePreview(
  username: string,
  password: string,
  input: CreateInvoiceInput,
): Promise<{ draft: InvoiceDraftRef; html: string }> {
  return withSession(username, password, async (client, token) => {
    const draft = await client.createDraftInvoice(token, buildInvoiceDetails(input))
    const html = await client.getInvoiceHTML(token, draft.uuid, { signed: false })
    return { draft: { date: draft.date, uuid: draft.uuid }, html }
  })
}

export async function gibConfirmInvoiceIssue(
  username: string,
  password: string,
  draft: InvoiceDraftRef,
): Promise<{ uuid: string; html: string }> {
  return withSession(username, password, async (client, token) => {
    let invoice: unknown = null
    for (let attempt = 0; attempt < 4; attempt += 1) {
      invoice = await client.findInvoice(token, draft as any)
      if (invoice) break
      await sleep(1200)
    }
    if (!invoice) {
      throw new Error('Onaylanacak taslak fatura bulunamadı.')
    }
    await client.signDraftInvoice(token, invoice as any)
    const html = await client.getInvoiceHTML(token, draft.uuid, { signed: true })
    return { uuid: draft.uuid, html }
  })
}

export async function gibGetInvoiceHtml(
  username: string,
  password: string,
  uuid: string,
  signed: boolean,
): Promise<string> {
  return withSession(username, password, (client, token) =>
    client.getInvoiceHTML(token, uuid, { signed }),
  )
}

export async function gibListInvoices(
  username: string,
  password: string,
  startDate: string,
  endDate: string,
) {
  return withSession(username, password, (client, token) =>
    client.getAllInvoicesByDateRange(token, { startDate, endDate }),
  )
}

export async function gibCancelInvoice(
  username: string,
  password: string,
  ettn: string,
  reason: string,
) {
  return withSession(username, password, (client, token) =>
    client.cancelDraftInvoice(token, reason, { ettn } as any),
  )
}

export async function gibLookupRecipient(
  username: string,
  password: string,
  taxIdOrTrid: string,
) {
  return withSession(username, password, (client, token) =>
    client.getRecipientDataByTaxIDOrTRID(token, taxIdOrTrid),
  )
}

function parseMaybeNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const normalized = value.trim().replace(/\./g, '').replace(',', '.')
  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function parseIssueDate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  const m = trimmed.match(/^(\d{2})[./-](\d{2})[./-](\d{2,4})$/)
  if (!m) return null
  const day = m[1]
  const month = m[2]
  const year = m[3].length === 2 ? `20${m[3]}` : m[3]
  return `${year}-${month}-${day}`
}

function normalizeStatus(value: unknown): string {
  const raw = typeof value === 'string' ? value.toLocaleLowerCase('tr-TR') : ''
  if (raw.includes('iptal') || raw.includes('sil')) return 'cancelled'
  if (raw.includes('onay')) return 'approved'
  if (raw.includes('taslak') || raw.includes('onaylanmad')) return 'draft'
  return 'unknown'
}

function readInvoiceUuid(invoice: Record<string, unknown>): string | null {
  const ettn = typeof invoice.ettn === 'string' ? invoice.ettn.trim() : ''
  if (ettn) return ettn
  const docNo = typeof invoice.belgeNumarasi === 'string' ? invoice.belgeNumarasi.trim() : ''
  return docNo || null
}

export function mapInvoicesToFacts(
  username: string,
  invoices: unknown[],
): InvoiceFactRow[] {
  return invoices
    .map((row): InvoiceFactRow | null => {
      if (!row || typeof row !== 'object') return null
      const invoice = row as Record<string, unknown>
      const invoiceUuid = readInvoiceUuid(invoice)
      if (!invoiceUuid) return null

      const grossTotal =
        parseMaybeNumber(invoice.vergilerDahilToplamTutar) ??
        parseMaybeNumber(invoice.odenecekTutar) ??
        null
      const netTotal =
        parseMaybeNumber(invoice.malhizmetToplamTutari) ??
        parseMaybeNumber(invoice.matrah) ??
        null
      const explicitVat =
        parseMaybeNumber(invoice.hesaplanankdv) ??
        parseMaybeNumber(invoice.vergilerToplami) ??
        null
      const vatTotal =
        explicitVat ?? (grossTotal !== null && netTotal !== null ? grossTotal - netTotal : null)

      return {
        gib_username: username,
        invoice_uuid: invoiceUuid,
        issue_date: parseIssueDate(invoice.belgeTarihi ?? invoice.faturaTarihi),
        status: normalizeStatus(invoice.onayDurumu),
        currency: typeof invoice.paraBirimi === 'string' ? invoice.paraBirimi : 'TRY',
        gross_total: grossTotal,
        vat_total: vatTotal,
        net_total: netTotal,
        customer_tax_id:
          typeof invoice.aliciVknTckn === 'string' ? invoice.aliciVknTckn : null,
        customer_name:
          typeof invoice.aliciUnvanAdSoyad === 'string'
            ? invoice.aliciUnvanAdSoyad
            : typeof invoice.aliciUnvan === 'string'
              ? invoice.aliciUnvan
              : null,
        raw_payload: invoice,
      }
    })
    .filter((row): row is InvoiceFactRow => row !== null)
}
