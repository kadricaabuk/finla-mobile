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
      price: item.unitPrice,
      vatRate: item.vatRate,
      vatAmount,
      totalAmount,
    }
  })
  const grandTotal = items.reduce((s, i) => s + i.totalAmount, 0)
  const totalVAT = items.reduce((s, i) => s + i.vatAmount, 0)
  return {
    date: input.date || todayFormatted(),
    time: nowTimeFormatted(),
    currency: input.currency || 'TRY',
    taxOrIdentityNum: input.buyerTaxId || '11111111111',
    title: input.buyerName,
    fullAddress: input.buyerAddress || '',
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

async function forceLogoutByUser(username: string): Promise<void> {
  await fetch(`${BASE}/earsiv-services/assos-sign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: new URLSearchParams({
      assoscmd: 'logout',
      rtype: 'json',
      userid: username,
      token: '',
    }).toString(),
  }).catch(() => {})
}

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms))
}

async function getTokenWithRecovery(
  client: ReturnType<typeof createFaturaClient>,
  username: string,
  password: string,
): Promise<string> {
  try {
    return await client.getToken(username, password)
  } catch (err) {
    if (!isMultiSessionError(err)) throw err

    console.log('GIB multi-session warning; forcing logout before retry')
    await forceLogoutByUser(username)
    await sleep(1500)
    return client.getToken(username, password)
  }
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
  let token: string | null = null
  try {
    token = await getTokenWithRecovery(client, username, password)
  } finally {
    if (token) await client.logout(token).catch(() => {})
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
