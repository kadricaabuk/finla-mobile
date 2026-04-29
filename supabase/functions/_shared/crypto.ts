const encoder = new TextEncoder()
const decoder = new TextDecoder()

export interface EncryptedTokenPayload {
  tokenEnc: string
  tokenIv: string
  tokenTag: string
  keyVersion: number
}

export interface EncryptedSecretPayload {
  secretEnc: string
  secretIv: string
  secretTag: string
  keyVersion: number
}

function toBase64(input: Uint8Array): string {
  let binary = ''
  for (const b of input) binary += String.fromCharCode(b)
  return btoa(binary)
}

function fromBase64(input: string): Uint8Array {
  const binary = atob(input)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

function getMasterKeyBytes(): Uint8Array {
  const raw = Deno.env.get('AUTH_MASTER_KEY')
  if (!raw) throw new Error('AUTH_MASTER_KEY tanimli degil.')
  const key = fromBase64(raw)
  if (key.length !== 32) throw new Error('AUTH_MASTER_KEY base64 32-byte olmali.')
  return key
}

async function importAesKey(): Promise<CryptoKey> {
  const raw = getMasterKeyBytes()
  return crypto.subtle.importKey(
    'raw',
    asArrayBuffer(raw),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptToken(plainToken: string): Promise<EncryptedTokenPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await importAesKey()
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, tagLength: 128 },
      key,
      asArrayBuffer(encoder.encode(plainToken)),
    ),
  )
  const tag = encrypted.slice(encrypted.length - 16)
  const ciphertext = encrypted.slice(0, encrypted.length - 16)
  return {
    tokenEnc: toBase64(ciphertext),
    tokenIv: toBase64(iv),
    tokenTag: toBase64(tag),
    keyVersion: 1,
  }
}

export async function decryptToken(parts: {
  tokenEnc: string
  tokenIv: string
  tokenTag: string
}): Promise<string> {
  const key = await importAesKey()
  const ciphertext = fromBase64(parts.tokenEnc)
  const tag = fromBase64(parts.tokenTag)
  const iv = fromBase64(parts.tokenIv)
  const encrypted = new Uint8Array(ciphertext.length + tag.length)
  encrypted.set(ciphertext, 0)
  encrypted.set(tag, ciphertext.length)
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    key,
    asArrayBuffer(encrypted),
  )
  return decoder.decode(plain)
}

export async function encryptSecret(plainSecret: string): Promise<EncryptedSecretPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await importAesKey()
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, tagLength: 128 },
      key,
      asArrayBuffer(encoder.encode(plainSecret)),
    ),
  )
  const tag = encrypted.slice(encrypted.length - 16)
  const ciphertext = encrypted.slice(0, encrypted.length - 16)
  return {
    secretEnc: toBase64(ciphertext),
    secretIv: toBase64(iv),
    secretTag: toBase64(tag),
    keyVersion: 1,
  }
}

export async function decryptSecret(parts: {
  secretEnc: string
  secretIv: string
  secretTag: string
}): Promise<string> {
  const key = await importAesKey()
  const ciphertext = fromBase64(parts.secretEnc)
  const tag = fromBase64(parts.secretTag)
  const iv = fromBase64(parts.secretIv)
  const encrypted = new Uint8Array(ciphertext.length + tag.length)
  encrypted.set(ciphertext, 0)
  encrypted.set(tag, ciphertext.length)
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    key,
    asArrayBuffer(encrypted),
  )
  return decoder.decode(plain)
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', asArrayBuffer(encoder.encode(value)))
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}
