/** TCMB döviz kuru (1 birim dövizin TL karşılığı). */
export type SupportedExchangeCurrency = 'USD' | 'EUR'

export interface ExchangeRateQuote {
  currency: SupportedExchangeCurrency
  /** 1 birim dövizin TL karşılığı (GİB dovzTLkur). */
  rate: string
  /** Kurun geçerli olduğu tarih (GG/AA/YYYY). */
  rateDate: string
  source: 'TCMB'
  /** TCMB döviz satış kuru. */
  rateType: 'forex_selling'
}

const TCMB_BASE = 'https://www.tcmb.gov.tr/kurlar'
const SUPPORTED = new Set<SupportedExchangeCurrency>(['USD', 'EUR'])

type CacheEntry = { quote: ExchangeRateQuote; fetchedAt: number }
const cache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 30 * 60 * 1000

function todayTrDate(): string {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function parseTrDate(trDate: string): { dd: string; mm: string; yyyy: string } | null {
  const m = trDate.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return null
  return { dd: m[1], mm: m[2], yyyy: m[3] }
}

function trDateToIso(trDate: string): string | null {
  const p = parseTrDate(trDate)
  if (!p) return null
  return `${p.yyyy}-${p.mm}-${p.dd}`
}

function isoToTr(iso: string): string {
  const [yyyy, mm, dd] = iso.split('-')
  return `${dd}/${mm}/${yyyy}`
}

function addDaysIso(iso: string, delta: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

function formatRate(value: number): string {
  const fixed = value.toFixed(4)
  return fixed.replace(/\.?0+$/, '') || value.toString()
}

function tcmbUrlForIso(iso: string, isToday: boolean): string {
  if (isToday) return `${TCMB_BASE}/today.xml`
  const [yyyy, mm, dd] = iso.split('-')
  return `${TCMB_BASE}/${yyyy}${mm}/${dd}${mm}${yyyy}.xml`
}

function extractRateFromXml(
  xml: string,
  currency: SupportedExchangeCurrency,
): { rate: number; rateDate: string } | null {
  const blockRe = new RegExp(
    `<Currency[^>]*CurrencyCode="${currency}"[^>]*>([\\s\\S]*?)</Currency>`,
    'i',
  )
  const block = xml.match(blockRe)?.[1]
  if (!block) return null

  const sellingRaw = block.match(/<ForexSelling>([\d.]+)<\/ForexSelling>/i)?.[1]
  if (!sellingRaw) return null
  const selling = Number(sellingRaw)
  if (!Number.isFinite(selling) || selling <= 0) return null

  const unitRaw = block.match(/<Unit>(\d+)<\/Unit>/i)?.[1]
  const unit = unitRaw ? Number(unitRaw) : 1
  if (!Number.isFinite(unit) || unit <= 0) return null

  const tarihAttr =
    xml.match(/<Tarih_Date[^>]*\sTarih="(\d{2}\.\d{2}\.\d{4})"/i)?.[1] ??
    xml.match(/<Tarih_Date[^>]*\sDate="(\d{2}\/\d{2}\/\d{4})"/i)?.[1]

  let rateDate = todayTrDate()
  if (tarihAttr) {
    const dot = tarihAttr.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
    if (dot) rateDate = `${dot[1]}/${dot[2]}/${dot[3]}`
    else if (parseTrDate(tarihAttr)) rateDate = tarihAttr
  }

  return { rate: selling / unit, rateDate }
}

async function fetchTcmbXml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { accept: 'application/xml,text/xml,*/*' },
    })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

/**
 * TCMB'den USD/EUR kurunu getirir. Hafta sonu/tatilde ilgili güne yayın yoksa
 * geriye doğru en fazla 7 işlem günü dener.
 */
export async function fetchTcmbExchangeRate(
  currency: SupportedExchangeCurrency,
  invoiceDateTr?: string,
): Promise<ExchangeRateQuote> {
  const normalized = currency.toUpperCase() as SupportedExchangeCurrency
  if (!SUPPORTED.has(normalized)) {
    throw new Error(`Desteklenmeyen para birimi: ${currency}. USD veya EUR kullan.`)
  }

  const todayIso = new Date().toISOString().slice(0, 10)
  let targetIso = invoiceDateTr ? trDateToIso(invoiceDateTr) : todayIso
  if (!targetIso) throw new Error('Tarih formatı GG/AA/YYYY olmalıdır.')

  if (targetIso > todayIso) targetIso = todayIso

  const cacheKey = `${normalized}:${targetIso}`
  const cached = cache.get(cacheKey)
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.quote
  }

  let iso = targetIso
  for (let i = 0; i < 8; i += 1) {
    const isToday = iso === todayIso
    const xml = await fetchTcmbXml(tcmbUrlForIso(iso, isToday))
    if (xml) {
      const parsed = extractRateFromXml(xml, normalized)
      if (parsed) {
        const quote: ExchangeRateQuote = {
          currency: normalized,
          rate: formatRate(parsed.rate),
          rateDate: parsed.rateDate,
          source: 'TCMB',
          rateType: 'forex_selling',
        }
        cache.set(cacheKey, { quote, fetchedAt: Date.now() })
        return quote
      }
    }
    iso = addDaysIso(iso, -1)
  }

  throw new Error(
    'TCMB kur bilgisine şu an ulaşılamadı. Lütfen biraz sonra tekrar dene veya kur oranını manuel gir.',
  )
}

export function isForeignInvoiceCurrency(
  currency: string | undefined,
): currency is SupportedExchangeCurrency {
  const c = (currency ?? '').trim().toUpperCase()
  return c === 'USD' || c === 'EUR'
}
