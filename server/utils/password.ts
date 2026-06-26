import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

// scrypt password hashing — zero native deps, stored as `scrypt$<saltHex>$<hashHex>`.
// (Sessions are handled by nuxt-auth-utils; only the credential check lives here.)

export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, 64)
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const salt = Buffer.from(parts[1], 'hex')
  const expected = Buffer.from(parts[2], 'hex')
  const actual = scryptSync(password, salt, expected.length)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
