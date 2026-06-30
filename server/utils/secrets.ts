import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

// Encryption at rest for stored secrets (Anthropic key, GitHub App private key, repo PAT). AES-256-GCM
// with a key derived from the instance session secret (already required by nuxt-auth-utils). Values are
// tagged "enc:v1:" so legacy plaintext keeps working and only new writes are encrypted.
const PREFIX = 'enc:v1:'

let _key: Buffer | null | undefined // cached: scrypt is deliberately slow, derive the key only once
function key(): Buffer | null {
  if (_key !== undefined) return _key
  const secret = process.env.NUXT_SESSION_PASSWORD || process.env.CAIRN_SECRET
  _key = (!secret || secret.length < 16) ? null : scryptSync(secret, 'cairn-secret-at-rest', 32)
  return _key
}

export function encryptSecret(plain: string): string {
  const k = key()
  if (!k) return plain
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', k, iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64')
}

export function decryptSecret(stored: string | null): string | null {
  if (!stored || !stored.startsWith(PREFIX)) return stored // null or legacy plaintext
  const k = key()
  if (!k) return null
  try {
    const buf = Buffer.from(stored.slice(PREFIX.length), 'base64')
    const d = createDecipheriv('aes-256-gcm', k, buf.subarray(0, 12))
    d.setAuthTag(buf.subarray(12, 28))
    return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8')
  }
  catch { return null }
}
