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

export function addTrace(
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

function normalizeMsg(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.toLocaleLowerCase('tr-TR')
}

export function isMultiSessionError(err: unknown): boolean {
  const msg = normalizeMsg(err)
  return (
    msg.includes('önce güvenli çıkış yapın') ||
    msg.includes('once guvenli cikis yapin') ||
    msg.includes('birden fazla') ||
    msg.includes('multiple') ||
    msg.includes('oturum')
  )
}

export function isBadCredentialsError(err: unknown): boolean {
  const msg = normalizeMsg(err)
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

export function isRecoverableAuthError(err: unknown): boolean {
  const msg = normalizeMsg(err)
  if (
    msg.includes('unexpected token') ||
    msg.includes('not valid json') ||
    msg.includes('<html')
  ) {
    return false
  }
  return (
    msg.includes('clientip') ||
    msg.includes('oturum geçersiz') ||
    msg.includes('oturum gecersiz') ||
    msg.includes('session invalid') ||
    msg.includes('geçersiz token') ||
    msg.includes('gecersiz token') ||
    msg.includes('yetkisiz') ||
    msg.includes('unauthorized')
  )
}

export function isInvalidSessionError(err: unknown): boolean {
  const msg = normalizeMsg(err)
  return (
    msg.includes('oturum geçersiz') ||
    msg.includes('oturum gecersiz') ||
    msg.includes('session invalid') ||
    msg.includes('yetkisiz') ||
    msg.includes('unauthorized')
  )
}

export function classifyAuthError(err: unknown): GibAuthErrorCode {
  if (isMultiSessionError(err)) return 'MULTI_SESSION_PERSISTED'
  if (isBadCredentialsError(err)) return 'BAD_CREDENTIALS'
  if (isRecoverableAuthError(err)) return 'GIB_TEMPORARY'
  return 'UNKNOWN'
}
