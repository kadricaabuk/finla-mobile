/** Normalize TR mobile to digits-only username form: 905xxxxxxxxx */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('90') && digits.length === 12) return digits
  if (digits.startsWith('0') && digits.length === 11) return `9${digits}`
  if (digits.length === 10 && digits.startsWith('5')) return `90${digits}`
  if (digits.length === 12 && digits.startsWith('90')) return digits
  throw new Error('Geçerli bir telefon numarası gir (örn. 0555 123 45 67).')
}

export function formatPhoneDisplay(phone: string): string {
  const d = phone.replace(/\D/g, '')
  if (d.length === 12 && d.startsWith('90')) {
    return `+${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10)}`
  }
  return phone
}

export function isValidVknTckn(raw: string): boolean {
  const id = raw.replace(/\s/g, '')
  return /^\d{10}$/.test(id) || /^\d{11}$/.test(id)
}

export function normalizeVknTckn(raw: string): string {
  const id = raw.replace(/\s/g, '')
  if (!isValidVknTckn(id)) {
    throw new Error('Geçerli bir VKN (10 hane) veya TCKN (11 hane) gir.')
  }
  return id
}
