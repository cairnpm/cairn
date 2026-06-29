import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// ── Isolated DB ──────────────────────────────────────────────────────────────
// Fresh SQLite file for the whole run, so tests never touch the dev DB (.data/app.db).
const dir = mkdtempSync(join(tmpdir(), 'cairn-intake-'))
process.env.NUXT_DB_URL = `file:${join(dir, 'app.db')}`

// The gateway calls `createError` (a Nitro auto-import) only on error paths. We invoke the gateway
// functions directly (no HTTP handler), so shim it.
;(globalThis as Record<string, unknown>).createError = (opts: { statusMessage?: string }) =>
  Object.assign(new Error(opts?.statusMessage ?? 'error'), opts)

// ── LLM mode ─────────────────────────────────────────────────────────────────
// REAL (Anthropic) when a key is available and INTAKE_TEST_STUB!=1; otherwise the deterministic STUB.
// getLlm() reads ANTHROPIC_API_KEY from env (vitest does not auto-load .env, so we do).
if (process.env.INTAKE_TEST_STUB === '1') {
  delete process.env.ANTHROPIC_API_KEY
} else if (!process.env.ANTHROPIC_API_KEY) {
  try {
    const env = readFileSync(join(process.cwd(), '.env'), 'utf8')
    const m = env.match(/^\s*ANTHROPIC_API_KEY\s*=\s*(.+)\s*$/m)
    if (m) process.env.ANTHROPIC_API_KEY = m[1].trim().replace(/^["']|["']$/g, '')
  } catch { /* no .env → stub */ }
}
// Tests use a stronger model than the app default (Haiku) for consistent routing — Haiku is too
// non-deterministic for assertions. Override with ANTHROPIC_MODEL to test a specific model.
process.env.ANTHROPIC_MODEL ||= 'claude-sonnet-4-6'

// eslint-disable-next-line no-console
console.log(
  `\n[intake tests] mode = ${process.env.ANTHROPIC_API_KEY ? `REAL (anthropic:${process.env.ANTHROPIC_MODEL})` : 'STUB (deterministic, offline)'} · db = ${process.env.NUXT_DB_URL}\n`,
)
