/** GİB UBL-TR / UN/ECE ölçü birim kodları (2–3 karakter). */
const KNOWN_GIB_UNIT_CODES = new Set([
  'C62', 'KGM', 'GRM', 'LTR', 'MTR', 'MTK', 'MTQ', 'DMK', 'HUR', 'DAY', 'SET',
  'PR', 'T3', 'CEN', 'KWH', 'MWH', 'GWH', 'KWT', 'CTM', 'NCL', 'SM3', 'R9', 'GT',
  '3I', 'B32', 'D40',
])

/** Türkçe / yaygın birim adları → GİB kodu. */
const GIB_UNIT_ALIASES: Record<string, string> = {
  ADET: 'C62',
  AD: 'C62',
  PIECE: 'C62',
  UNIT: 'C62',
  KG: 'KGM',
  KILOGRAM: 'KGM',
  KİLOGRAM: 'KGM',
  GRAM: 'GRM',
  G: 'GRM',
  LITRE: 'LTR',
  LİTRE: 'LTR',
  LT: 'LTR',
  METRE: 'MTR',
  M: 'MTR',
  SAAT: 'HUR',
  HOUR: 'HUR',
  HR: 'HUR',
  GUN: 'DAY',
  GÜN: 'DAY',
  SET: 'SET',
  CIFT: 'PR',
  ÇİFT: 'PR',
  KUTU: 'C62',
  BOX: 'C62',
  KWH: 'KWH',
  'KİLOWATT SAAT': 'KWH',
  'KILOWATT SAAT': 'KWH',
  'METRE KARE': 'MTK',
  M2: 'MTK',
  'METRE KÜP': 'MTQ',
  M3: 'MTQ',
  DESIMETREKARE: 'DMK',
  DM2: 'DMK',
  CIFT: 'PR',
  BINADET: 'T3',
  'BİN ADET': 'T3',
  YUZADET: 'CEN',
  'YÜZ ADET': 'CEN',
}

/**
 * Kullanıcı/Claude birim adını GİB'in beklediği UN/ECE koduna çevirir.
 * Bilinmeyen uzun metinler için güvenli varsayılan: C62 (adet).
 */
export function normalizeGibUnit(raw: string | undefined): string {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return 'C62'

  const upper = trimmed.toLocaleUpperCase('tr-TR')
  const alias = GIB_UNIT_ALIASES[upper]
  if (alias) return alias

  const code = upper.replace(/\s/g, '')
  if (/^[A-Z0-9İ]{2,3}$/.test(code)) {
    const ascii = code
      .replace(/İ/g, 'I')
      .replace(/Ş/g, 'S')
      .replace(/Ğ/g, 'G')
      .replace(/Ü/g, 'U')
      .replace(/Ö/g, 'O')
      .replace(/Ç/g, 'C')
    if (KNOWN_GIB_UNIT_CODES.has(ascii)) return ascii
    if (/^[A-Z0-9]{2,3}$/.test(ascii)) return ascii
  }

  return 'C62'
}
