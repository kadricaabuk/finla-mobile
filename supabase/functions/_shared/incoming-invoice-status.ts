/** Liste UI — portal ile hizalı gösterim etiketleri. */
export type IncomingInvoiceDisplayStatus =
  | 'Yanıt Bekleniyor'
  | 'Kabul Kuyruğunda'
  | 'Red Kuyruğunda'
  | 'Kabul'
  | 'Red'
  | 'İptal'

/** `invoice_facts` / `invoice-detail` — gelen fatura fact status. */
export type IncomingInvoiceFactStatus =
  | 'pending_response'
  | 'accepted'
  | 'rejected'
  | 'cancelled'
  | 'unknown'

const DISPLAY_PENDING: IncomingInvoiceDisplayStatus = 'Yanıt Bekleniyor'
const DISPLAY_ACCEPT_QUEUE: IncomingInvoiceDisplayStatus = 'Kabul Kuyruğunda'
const DISPLAY_REJECT_QUEUE: IncomingInvoiceDisplayStatus = 'Red Kuyruğunda'
const DISPLAY_ACCEPTED: IncomingInvoiceDisplayStatus = 'Kabul'
const DISPLAY_REJECTED: IncomingInvoiceDisplayStatus = 'Red'
const DISPLAY_CANCELLED: IncomingInvoiceDisplayStatus = 'İptal'

function inboxStatusKey(raw: string): string {
  return raw.toLocaleLowerCase('tr-TR').trim().replace(/_/g, ' ')
}

/** Mysoft `*_KUYRUGUNDA` → tr-TR lower `kuyruğunda` (ğ); `kuyruk` substring'i tutmaz. */
function isInboxQueueStatus(s: string): boolean {
  return s.includes('kuyru')
}

function isPendingInboxStatus(s: string): boolean {
  if (isInboxQueueStatus(s)) return false
  return (
    s.includes('yanıt bek') ||
    s.includes('yanit bek') ||
    s.includes('bekleniyor') ||
    s.includes('wait') ||
    s === 'pending_response' ||
    s === 'yanit bekleniyor' ||
    s === 'yanıt bekleniyor'
  )
}

function isAcceptQueueInboxStatus(s: string): boolean {
  return isInboxQueueStatus(s) && s.includes('kabul')
}

function isRejectQueueInboxStatus(s: string): boolean {
  return isInboxQueueStatus(s) && (s.includes('red') || s.includes('redd'))
}

export function parseMysoftInboxStatusRaw(source: unknown): string {
  if (typeof source === 'string') return source.trim()
  if (!source || typeof source !== 'object') return ''
  const row = source as Record<string, unknown>
  for (const key of [
    'invoiceStatusText',
    'status',
    'invoiceStatus',
    'invoiceStatusName',
    'onayDurumu',
    'statusText',
  ]) {
    const v = row[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

export function normalizeInboxDisplayStatus(
  raw: string,
): IncomingInvoiceDisplayStatus | string {
  const s = inboxStatusKey(raw)
  if (!s) return 'Bilinmiyor'
  if (isPendingInboxStatus(s)) {
    return DISPLAY_PENDING
  }
  if (isAcceptQueueInboxStatus(s)) {
    return DISPLAY_ACCEPT_QUEUE
  }
  if (isRejectQueueInboxStatus(s)) {
    return DISPLAY_REJECT_QUEUE
  }
  if (s === 'kabul' || s.includes('kabul edildi') || s.includes('accepted')) {
    return DISPLAY_ACCEPTED
  }
  if (s === 'red' || s.includes('redd') || s.includes('reject')) {
    return DISPLAY_REJECTED
  }
  if (s.includes('iptal') || s.includes('cancel')) {
    return DISPLAY_CANCELLED
  }
  return raw.trim()
}

export function inboxDisplayToFactStatus(
  display: string,
): IncomingInvoiceFactStatus {
  const s = inboxStatusKey(display)
  if (isPendingInboxStatus(s)) {
    return 'pending_response'
  }
  if (isAcceptQueueInboxStatus(s) || s === 'kabul' || s.includes('kabul')) {
    return 'accepted'
  }
  if (
    isRejectQueueInboxStatus(s) ||
    s === 'red' ||
    s.includes('redd') ||
    s.includes('reject')
  ) {
    return 'rejected'
  }
  if (s.includes('iptal') || s.includes('cancel')) return 'cancelled'
  return 'unknown'
}

export function normalizeIncomingFactStatus(value: unknown): IncomingInvoiceFactStatus {
  if (typeof value !== 'string' || !value.trim()) return 'unknown'
  const lower = value.toLocaleLowerCase('tr-TR').trim()
  if (lower === 'approved') return 'accepted'
  if (
    lower === 'pending_response' ||
    lower === 'accepted' ||
    lower === 'rejected' ||
    lower === 'cancelled' ||
    lower === 'unknown'
  ) {
    return lower as IncomingInvoiceFactStatus
  }
  const display = normalizeInboxDisplayStatus(value)
  return inboxDisplayToFactStatus(display)
}

/** Gider toplamına dahil gelen fatura (kabul edilmiş). */
export function isIncomingExpenseFactStatus(status: unknown): boolean {
  return normalizeIncomingFactStatus(status) === 'accepted'
}

export function canRespondToIncomingInvoice(status?: string): boolean {
  const fact = normalizeIncomingFactStatus(status ?? '')
  if (fact === 'pending_response') return true
  if (fact === 'accepted' || fact === 'rejected' || fact === 'cancelled') {
    return false
  }
  return fact === 'unknown'
}

export function incomingFactStatusLabel(
  status: IncomingInvoiceFactStatus | string,
): string {
  switch (status) {
    case 'pending_response':
      return DISPLAY_PENDING
    case 'accepted':
      return DISPLAY_ACCEPTED
    case 'rejected':
      return DISPLAY_REJECTED
    case 'cancelled':
      return DISPLAY_CANCELLED
    default:
      return typeof status === 'string' && status.trim() ? status : '—'
  }
}
