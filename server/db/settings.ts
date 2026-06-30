import { decryptSecret, encryptSecret } from '../utils/secrets'
import { get, run } from './client'

// Runtime key/value config (Anthropic key + model, …). Read at request time so the Settings
// screen can change them without a server restart. See server/llm/provider.ts for the cache.

export function getSetting(key: string): string | null {
  return get<{ value: string | null }>('SELECT value FROM settings WHERE key = ?', key)?.value ?? null
}

export function setSetting(key: string, value: string | null, by: string | null = null): void {
  run(
    `INSERT INTO settings (key, value, updated_by, updated_at) VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    key, value, by,
  )
}

// Secret variants — encrypt at rest (AES-256-GCM). Use these for the Anthropic key, the GitHub App
// private key, and the repo PAT. Reads transparently decrypt (legacy plaintext passes through).
export function getSecret(key: string): string | null {
  return decryptSecret(getSetting(key))
}

export function setSecret(key: string, plain: string | null, by: string | null = null): void {
  setSetting(key, plain ? encryptSecret(plain) : null, by)
}
