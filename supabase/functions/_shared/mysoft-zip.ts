import { unzipSync } from 'npm:fflate'

function decodeText(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
}

function decodeBase64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64.replace(/\s/g, ''))
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export function looksLikeZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b
}

export function looksLikePdf(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  )
}

function extractBase64ZipField(value: unknown): Uint8Array | null {
  if (typeof value === 'string' && value.length > 0) {
    try {
      const decoded = decodeBase64ToBytes(value)
      if (looksLikeZip(decoded)) return decoded
    } catch {
      return null
    }
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    for (const key of ['file', 'content', 'data', 'zip', 'fileContent']) {
      const nested = extractBase64ZipField(obj[key])
      if (nested) return nested
    }
  }
  return null
}

/** Mysoft zip indirmeleri ham PK, JSON zarfı veya düz base64 dönebilir. */
export function normalizeMysoftZipPayload(payload: Uint8Array): Uint8Array {
  if (looksLikeZip(payload)) return payload

  const text = decodeText(payload).trim()
  if (!text) {
    throw new Error('e-Fatura servisi boş yanıt döndü.')
  }

  if (text.startsWith('{') || text.startsWith('[')) {
    let json: Record<string, unknown>
    try {
      json = JSON.parse(text) as Record<string, unknown>
    } catch {
      throw new Error('Belge yanıtı okunamadı.')
    }

    if (json.succeed === false || json.success === false) {
      const msg = typeof json.message === 'string'
        ? json.message
        : 'Belge işlemi başarısız.'
      throw new Error(msg)
    }

    const fromData = extractBase64ZipField(json.data)
    if (fromData) return fromData

    for (const key of ['zip', 'file', 'content', 'fileContent', 'result']) {
      const fromKey = extractBase64ZipField(json[key])
      if (fromKey) return fromKey
    }

    throw new Error('Belge yanıtında zip verisi bulunamadı.')
  }

  const compact = text.replace(/\s/g, '')
  if (compact.length > 16 && /^[A-Za-z0-9+/=]+$/.test(compact)) {
    try {
      const decoded = decodeBase64ToBytes(compact)
      if (looksLikeZip(decoded)) return decoded
    } catch {
      // fall through
    }
  }

  throw new Error('Geçersiz zip verisi: belge yanıtı ZIP formatında değil.')
}

export function tryReadDirectHtml(payload: Uint8Array): string | null {
  if (looksLikeZip(payload) || looksLikePdf(payload)) return null
  const text = decodeText(payload).trim()
  const lower = text.slice(0, 200).toLowerCase()
  if (lower.startsWith('<!doctype') || lower.startsWith('<html')) return text
  return null
}

export function tryReadDirectPdfBase64(payload: Uint8Array): string | null {
  if (!looksLikePdf(payload)) return null
  return bytesToBase64(payload)
}

function unzipEntries(zipBytes: Uint8Array): Record<string, Uint8Array> {
  const normalized = normalizeMysoftZipPayload(zipBytes)
  try {
    return unzipSync(normalized)
  } catch {
    throw new Error('Belge zip dosyası açılamadı.')
  }
}

export function extractHtmlFromZipBytes(zipBytes: Uint8Array): string | null {
  const entries = unzipEntries(zipBytes)
  const names = Object.keys(entries).sort()
  const htmlName =
    names.find((n) => n.toLowerCase().endsWith('.html')) ??
    names.find((n) => n.toLowerCase().includes('invoice') && n.toLowerCase().endsWith('.htm'))
  if (!htmlName) return null
  return decodeText(entries[htmlName])
}

export function extractPdfBase64FromZipBytes(zipBytes: Uint8Array): string | null {
  const entries = unzipEntries(zipBytes)
  const pdfName = Object.keys(entries).find((n) => n.toLowerCase().endsWith('.pdf'))
  if (!pdfName) return null
  return bytesToBase64(entries[pdfName])
}
