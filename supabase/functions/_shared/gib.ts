import { createFaturaClient } from 'npm:fatura'
import { createClient } from 'npm:@supabase/supabase-js'
import { decryptSecret, decryptToken, encryptSecret, encryptToken } from './crypto.ts'
import {
  GibAuthError,
  GibAuthErrorCode,
  GibAuthTraceEntry,
  addTrace,
  classifyAuthError,
  isInvalidSessionError,
  isMultiSessionError,
  isRecoverableAuthError,
} from './gib-errors.ts'
import { CreateInvoiceInput, buildInvoiceDetails } from './invoice-mapper.ts'

export type { GibAuthErrorCode, GibAuthTraceEntry }
export { GibAuthError }
export type { CreateInvoiceInput }
export { mapInvoicesToFacts } from './invoice-mapper.ts'
export type { InvoiceLineItem, InvoiceFactRow } from './invoice-mapper.ts'

export interface InvoiceDraftRef {
  date: string
  uuid: string
}

export type EnvironmentKey = 'PROD' | 'TEST'

export interface InvoiceListItem {
  ettn: string
  faturaTarihi: string
  aliciUnvan?: string
  aliciAdi?: string
  aliciSoyadi?: string
  belgeTuru?: string
  onayDurumu?: string
  [key: string]: unknown
}

export interface UserData {
  taxIDOrTRID: string
  title: string
  name: string
  surname: string
  registryNo?: string
  mersisNo?: string
  taxOffice?: string
  fullAddress?: string
  buildingName?: string
  buildingNumber?: string
  doorNumber?: string
  town?: string
  district?: string
  city?: string
  zipCode?: string
  country?: string
  phoneNumber?: string
  faxNumber?: string
  email?: string
  webSite?: string
  businessCenter?: string
}

const rawEnv = Deno.env.get('GIB_ENV') ?? 'PROD'
const env: EnvironmentKey = rawEnv === 'TEST' ? 'TEST' : 'PROD'
const faturaClient = createFaturaClient(env)
type FaturaClient = typeof faturaClient

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const supabaseAdmin =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey)
    : null

// ── Session store ─────────────────────────────────────────────────────────────

interface SessionEntry {
  token: string
  expiresAt: number
  lastUsedAt: number
}

const SESSION_TTL_MS = 10 * 60 * 1000
const sessionStore = new Map<string, SessionEntry>()
const sessionLocks = new Map<string, Promise<string>>()

function sessionKey(username: string): string {
  return `${env}:${username.trim()}`
}

function getActiveSession(username: string): SessionEntry | null {
  const key = sessionKey(username)
  const current = sessionStore.get(key)
  if (!current) return null
  if (current.expiresAt <= Date.now()) {
    sessionStore.delete(key)
    return null
  }
  return current
}

async function loadPersistedSessionToken(username: string): Promise<string | null> {
  if (!supabaseAdmin) return null
  const key = sessionKey(username)
  const { data, error } = await supabaseAdmin
    .from('gib_sessions')
    .select('token,token_enc,token_iv,token_tag')
    .eq('gib_username', key)
    .maybeSingle()
  if (error) throw error
  if (
    typeof data?.token_enc === 'string' &&
    typeof data?.token_iv === 'string' &&
    typeof data?.token_tag === 'string'
  ) {
    return decryptToken({
      tokenEnc: data.token_enc,
      tokenIv: data.token_iv,
      tokenTag: data.token_tag,
    })
  }
  const legacyToken = typeof data?.token === 'string' ? data.token : ''
  return legacyToken || null
}

async function loadPersistedPassword(username: string): Promise<string | null> {
  if (!supabaseAdmin) return null
  const key = sessionKey(username)
  const { data, error } = await supabaseAdmin
    .from('gib_sessions')
    .select('cred_enc,cred_iv,cred_tag')
    .eq('gib_username', key)
    .maybeSingle()
  if (error) throw error
  if (
    typeof data?.cred_enc === 'string' &&
    typeof data?.cred_iv === 'string' &&
    typeof data?.cred_tag === 'string'
  ) {
    return decryptSecret({
      secretEnc: data.cred_enc,
      secretIv: data.cred_iv,
      secretTag: data.cred_tag,
    })
  }
  return null
}

async function persistSessionToken(username: string, token: string): Promise<void> {
  if (!supabaseAdmin) return
  const key = sessionKey(username)
  const encrypted = await encryptToken(token)
  const { error } = await supabaseAdmin
    .from('gib_sessions')
    .upsert(
      {
        gib_username: key,
        token: null,
        token_enc: encrypted.tokenEnc,
        token_iv: encrypted.tokenIv,
        token_tag: encrypted.tokenTag,
        key_version: encrypted.keyVersion,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'gib_username' },
    )
  if (error) throw error
}

async function persistCredentials(username: string, password: string): Promise<void> {
  if (!supabaseAdmin) return
  const key = sessionKey(username)
  const encrypted = await encryptSecret(password)
  const { error } = await supabaseAdmin
    .from('gib_sessions')
    .upsert(
      {
        gib_username: key,
        cred_enc: encrypted.secretEnc,
        cred_iv: encrypted.secretIv,
        cred_tag: encrypted.secretTag,
        cred_key_version: encrypted.keyVersion,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'gib_username' },
    )
  if (error) throw error
}

async function deletePersistedSessionToken(username: string): Promise<void> {
  if (!supabaseAdmin) return
  const key = sessionKey(username)
  const { error } = await supabaseAdmin
    .from('gib_sessions')
    .delete()
    .eq('gib_username', key)
  if (error) throw error
}

async function deletePersistedCredentials(username: string): Promise<void> {
  if (!supabaseAdmin) return
  const key = sessionKey(username)
  const { error } = await supabaseAdmin
    .from('gib_sessions')
    .update({
      cred_enc: null,
      cred_iv: null,
      cred_tag: null,
      updated_at: new Date().toISOString(),
    })
    .eq('gib_username', key)
  if (error) throw error
}

// ── Session lifecycle ─────────────────────────────────────────────────────────

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function logoutToken(
  client: FaturaClient,
  token: string,
  trace: GibAuthTraceEntry[] = [],
): Promise<void> {
  try {
    await client.logout(token)
    addTrace(trace, 'session_logout_ok', 0, 'token logout basarili')
  } catch (err) {
    addTrace(trace, 'session_logout_error', 0, err instanceof Error ? err.message : String(err))
  }
}

async function getTokenWithRecovery(
  client: FaturaClient,
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

      addTrace(trace, 'multi_session_recovery', attempt, 'mevcut token logout + bekleme basliyor')
      try {
        const existing = await loadPersistedSessionToken(username)
        if (existing) {
          await logoutToken(client, existing, trace)
          sessionStore.delete(sessionKey(username))
          addTrace(
            trace,
            'multi_session_logout_existing',
            attempt,
            'persisted token ile logout denendi',
          )
        }
      } catch (logoutErr) {
        addTrace(
          trace,
          'multi_session_logout_existing_error',
          attempt,
          logoutErr instanceof Error ? logoutErr.message : String(logoutErr),
        )
      }
      await sleep(2000 + attempt * 1500)
    }
  }
  throw new Error('GIB oturum açılamadı.')
}

async function invalidateSession(
  username: string,
  trace: GibAuthTraceEntry[] = [],
  opts: { deleteCredentials?: boolean } = {},
): Promise<void> {
  const key = sessionKey(username)
  const existing = sessionStore.get(key)
  sessionStore.delete(key)
  const token =
    existing?.token ?? (await loadPersistedSessionToken(username).catch(() => null))
  if (token) await logoutToken(faturaClient, token, trace)
  await deletePersistedSessionToken(username).catch(() => undefined)
  if (opts.deleteCredentials) {
    await deletePersistedCredentials(username).catch(() => undefined)
  }
}

async function getOrCreateSessionToken(
  username: string,
  trace: GibAuthTraceEntry[] = [],
): Promise<string> {
  const existing = getActiveSession(username)
  if (existing) {
    existing.lastUsedAt = Date.now()
    addTrace(trace, 'session_hit', 0, 'aktif token cache den alindi')
    return existing.token
  }

  const key = sessionKey(username)
  const inFlight = sessionLocks.get(key)
  if (inFlight) {
    addTrace(trace, 'session_wait_lock', 0, 'ayni kullanici icin login lock bekleniyor')
    const token = await inFlight
    const postLock = getActiveSession(username)
    if (postLock) return postLock.token
    return token
  }

  addTrace(trace, 'session_miss', 0, 'cache de aktif token yok')
  const createPromise = (async () => {
    const token = await loadPersistedSessionToken(username)
    if (!token) {
      addTrace(trace, 'session_not_found', 0, 'persisted session yok')
      throw new Error('Aktif oturum bulunamadı. Lütfen tekrar giriş yapın.')
    }
    const now = Date.now()
    sessionStore.set(key, { token, lastUsedAt: now, expiresAt: now + SESSION_TTL_MS })
    addTrace(trace, 'session_create', 0, 'token persisted sessiondan alindi')
    return token
  })()

  sessionLocks.set(key, createPromise)
  try {
    return await createPromise
  } finally {
    sessionLocks.delete(key)
  }
}

async function withSession<T>(
  username: string,
  fn: (client: FaturaClient, token: string) => Promise<T>,
): Promise<T> {
  const trace: GibAuthTraceEntry[] = []
  let token = ''

  try {
    token = await getOrCreateSessionToken(username, trace)
    return await fn(faturaClient, token)
  } catch (err) {
    if (!token || !isRecoverableAuthError(err)) throw err

    addTrace(trace, 'session_refresh', 1, 'session rejected; token yenileniyor')
    const password = await loadPersistedPassword(username)
    if (!password) {
      throw new Error('GIB oturumu yenilenemedi. Lütfen tekrar giriş yapın.')
    }
    if (isInvalidSessionError(err)) {
      addTrace(trace, 'session_invalid_observed', 1, 'token yenileme denemesi')
    }
    const renewedToken = await getTokenWithRecovery(faturaClient, username, password, trace)
    await persistSessionToken(username, renewedToken)
    const now = Date.now()
    sessionStore.set(sessionKey(username), {
      token: renewedToken,
      lastUsedAt: now,
      expiresAt: now + SESSION_TTL_MS,
    })
    return await fn(faturaClient, renewedToken)
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function gibLogin(username: string, password: string): Promise<void> {
  await gibLoginWithTrace(username, password)
}

export async function gibLoginWithTrace(
  username: string,
  password: string,
): Promise<{ trace: GibAuthTraceEntry[] }> {
  const trace: GibAuthTraceEntry[] = []

  try {
    const token = await getTokenWithRecovery(faturaClient, username, password, trace)
    await persistCredentials(username, password)
    await persistSessionToken(username, token)
    const now = Date.now()
    sessionStore.set(sessionKey(username), {
      token,
      lastUsedAt: now,
      expiresAt: now + SESSION_TTL_MS,
    })
    addTrace(trace, 'session_persist', 0, 'token db ye yazildi')
    return { trace }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'GİB girişi başarısız.'
    const code = classifyAuthError(err)
    addTrace(trace, 'login_failed', 0, message)
    throw new GibAuthError(message, code, trace)
  }
}

export async function gibLogout(username: string): Promise<void> {
  const trace: GibAuthTraceEntry[] = []
  await invalidateSession(username, trace, { deleteCredentials: true })
}

export async function gibCreateInvoice(username: string, input: CreateInvoiceInput) {
  return withSession(username, (client, token) =>
    client.createDraftInvoice(token, buildInvoiceDetails(input)),
  )
}

export async function gibCreateInvoicePreview(
  username: string,
  input: CreateInvoiceInput,
): Promise<{ draft: InvoiceDraftRef; html: string }> {
  return withSession(username, async (client, token) => {
    const draft = await client.createDraftInvoice(token, buildInvoiceDetails(input))
    const html = await client.getInvoiceHTML(token, draft.uuid, { signed: false })
    return { draft: { date: draft.date, uuid: draft.uuid }, html }
  })
}

export async function gibConfirmInvoiceIssue(
  username: string,
  draft: InvoiceDraftRef,
): Promise<{ uuid: string; html: string }> {
  return withSession(username, async (client, token) => {
    let invoice: InvoiceListItem | undefined
    for (let attempt = 0; attempt < 4; attempt += 1) {
      invoice = await client.findInvoice(token, draft)
      if (invoice) break
      await sleep(1200)
    }
    if (!invoice) throw new Error('Onaylanacak taslak fatura bulunamadı.')
    await client.signDraftInvoice(token, invoice)
    const html = await client.getInvoiceHTML(token, draft.uuid, { signed: true })
    return { uuid: draft.uuid, html }
  })
}

export async function gibGetInvoiceHtml(
  username: string,
  uuid: string,
  signed: boolean,
): Promise<string> {
  return withSession(username, (client, token) =>
    client.getInvoiceHTML(token, uuid, { signed }),
  )
}

export async function gibListInvoices(
  username: string,
  startDate: string,
  endDate: string,
) {
  return withSession(username, (client, token) =>
    client.getAllInvoicesByDateRange(token, { startDate, endDate }),
  )
}

export async function gibCancelInvoice(username: string, ettn: string, reason: string) {
  const today = new Date()
  const todayFormatted = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`
  return withSession(username, async (client, token) => {
    const draftLike: InvoiceListItem = { ettn, faturaTarihi: todayFormatted }
    return client.cancelDraftInvoice(token, reason, draftLike)
  })
}

export async function gibLookupRecipient(username: string, taxIdOrTrid: string) {
  return withSession(username, (client, token) =>
    client.getRecipientDataByTaxIDOrTRID(token, taxIdOrTrid),
  )
}

export async function gibGetInvoicesIssuedToMe(
  username: string,
  startDate: string,
  endDate: string,
): Promise<InvoiceListItem[]> {
  return withSession(username, (client, token) =>
    client.getAllInvoicesIssuedToMeByDateRange(token, {
      startDate,
      endDate,
    }) as Promise<InvoiceListItem[]>,
  )
}

export async function gibGetDownloadURL(
  username: string,
  invoiceUUID: string,
  signed: boolean,
): Promise<string> {
  return withSession(username, (client, token) =>
    Promise.resolve(client.getDownloadURL(token, invoiceUUID, { signed })),
  )
}

export async function gibGetUserData(username: string): Promise<UserData> {
  return withSession(username, (client, token) =>
    client.getUserData(token) as Promise<UserData>,
  )
}

export async function gibUpdateUserData(username: string, userData: UserData): Promise<unknown> {
  return withSession(username, (client, token) => client.updateUserData(token, userData))
}

export async function gibSendSignSMSCode(
  username: string,
  phone: string,
): Promise<string | undefined> {
  return withSession(username, (client, token) => client.sendSignSMSCode(token, phone))
}

export async function gibVerifySignSMSCode(
  username: string,
  smsCode: string,
  operationId: string,
): Promise<string | undefined> {
  return withSession(username, (client, token) =>
    client.verifySignSMSCode(token, smsCode, operationId),
  )
}

// fatura.js-first naming aliases
export const faturaLogin = gibLogin
export const faturaLoginWithTrace = gibLoginWithTrace
export const faturaLogout = gibLogout
export const faturaCreateInvoice = gibCreateInvoice
export const faturaCreateInvoicePreview = gibCreateInvoicePreview
export const faturaConfirmInvoiceIssue = gibConfirmInvoiceIssue
export const faturaGetInvoiceHtml = gibGetInvoiceHtml
export const faturaListInvoices = gibListInvoices
export const faturaCancelInvoice = gibCancelInvoice
export const faturaLookupRecipient = gibLookupRecipient
export const faturaGetInvoicesIssuedToMe = gibGetInvoicesIssuedToMe
export const faturaGetDownloadURL = gibGetDownloadURL
export const faturaGetUserData = gibGetUserData
export const faturaUpdateUserData = gibUpdateUserData
export const faturaSendSignSMSCode = gibSendSignSMSCode
export const faturaVerifySignSMSCode = gibVerifySignSMSCode
