#!/usr/bin/env node
// Cairn CLI — an HTTP client against a running Nitro server, so an agent can drive the product's
// essential actions. Never opens SQLite directly (single-writer / one-write-path invariants).
// Zero deps: fetch, node:fs, node:util.parseArgs.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

/**
 * @typedef {object} Deps
 * @property {typeof globalThis.fetch} fetch
 * @property {string} configDir  Directory holding the cached session cookie (`session.json`).
 * @property {Record<string, string | undefined>} env
 * @property {{ write(s: string): unknown }} out
 */

/** Read the cached session cookie, or null when none is stored yet. @param {string} configDir */
function readCookie(configDir) {
  try {
    const raw = readFileSync(join(configDir, 'session.json'), 'utf8')
    const cookie = JSON.parse(raw)?.cookie
    return typeof cookie === 'string' ? cookie : null
  } catch { return null }
}

/** Persist the session cookie owner-only (600) — it's a credential. @param {string} configDir @param {string} cookie */
function writeCookie(configDir, cookie) {
  mkdirSync(configDir, { recursive: true })
  writeFileSync(join(configDir, 'session.json'), JSON.stringify({ cookie }), { mode: 0o600 })
}

/** Reduce a Set-Cookie header to the bare `name=value` pair, dropping attributes (Path, HttpOnly…). @param {string} setCookie */
function parseSetCookie(setCookie) {
  return (setCookie.split(';')[0] ?? '').trim()
}

/**
 * Log in with the env-injected credentials and return the fresh session cookie.
 * Attribution comes from this real account; creds are env-only, never flags, never logged.
 * @param {typeof globalThis.fetch} fetch @param {string} base @param {Record<string, string | undefined>} env @param {string} configDir
 * @returns {Promise<string>}
 */
async function login(fetch, base, env, configDir) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: env.CAIRN_EMAIL ?? '', password: env.CAIRN_PASSWORD ?? '' }),
  })
  const cookie = parseSetCookie(res.headers.get('set-cookie') ?? '')
  // Only cache a verified, non-empty cookie — a failed login carries no Set-Cookie, and persisting
  // '' would poison the cache with a blank credential the next call would blindly replay.
  if (res.ok && cookie) writeCookie(configDir, cookie)
  return cookie
}

/**
 * Map a read command to its API path — a CLOSED allowlist. The command names are the agent-facing
 * vocabulary; the paths are the server's (e.g. `betting` → the betting-tables endpoint). Returns null
 * for an unknown command or a `feature` missing its id, so `run` rejects it instead of hitting a
 * route: the agent's surface stays reads + capture only (no passthrough to out-of-scope endpoints).
 * @param {string | undefined} command @param {string | undefined} id @param {string | undefined} status
 */
function readPath(command, id, status) {
  if (command === 'feature') return id ? `/api/features/${encodeURIComponent(id)}` : null
  if (command === 'features') return status ? `/api/features?status=${encodeURIComponent(status)}` : '/api/features'
  if (command === 'hills') return '/api/hills'
  if (command === 'betting') return '/api/betting-tables'
  if (command === 'overview') return '/api/overview'
  return null
}

/**
 * Run one CLI invocation. Returns the process exit code.
 * @param {string[]} argv  Args after the binary name.
 * @param {Deps} deps
 * @returns {Promise<number>}
 */
export async function run(argv, deps) {
  const { fetch, configDir, env, out } = deps
  const base = env.CAIRN_URL ?? 'http://localhost:3000'
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { session: { type: 'string' }, status: { type: 'string' }, pretty: { type: 'boolean' } },
  })
  const emit = (/** @type {unknown} */ obj) => out.write(JSON.stringify(obj, null, values.pretty ? 2 : undefined))
  const [command, arg1] = positionals

  /**
   * Issue an authed request. Attaches the cached cookie (logging in first if there is none), and on a
   * 401 re-logs in once and retries — so an expired session is refreshed transparently.
   * @param {string} path @param {{ method?: string, body?: unknown }} [opts]
   */
  async function api(path, opts = {}) {
    let cookie = readCookie(configDir) ?? await login(fetch, base, env, configDir)
    const send = () => fetch(`${base}${path}`, {
      method: opts.method ?? 'GET',
      headers: { cookie, ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}) },
      ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
    })
    let res = await send()
    if (res.status === 401) {
      cookie = await login(fetch, base, env, configDir)
      res = await send()
    }
    return res
  }

  // `capture`/`commit` drive the multi-turn intake loop; the agent branches on the returned `state`.
  let res
  if (command === 'capture') {
    // session_id is omitted on the first turn (the server mints one), forwarded to continue thereafter.
    const body = values.session ? { message: arg1 ?? '', session_id: values.session } : { message: arg1 ?? '' }
    res = await api('/api/intake/turn', { method: 'POST', body })
  } else if (command === 'commit') {
    res = await api('/api/intake/commit', { method: 'POST', body: { session_id: values.session ?? '' } })
  } else {
    const path = readPath(command, arg1, values.status)
    // Unknown / out-of-scope command, or `feature` with no id: reject client-side (status 0 = no
    // request made) so the agent can't reach an endpoint outside the reads + capture surface.
    if (!path) {
      const message = command === 'feature' ? 'usage: cairn feature <id>' : `commande inconnue : ${command ?? '(aucune)'}`
      emit({ error: { status: 0, message } })
      return 1
    }
    res = await api(path)
  }
  const body = await res.json().catch(() => null)
  // Non-2xx → nonzero exit + a stable error envelope the driving agent can branch on.
  if (!res.ok) {
    // Nitro error bodies carry statusMessage/message — narrow the JSON at this boundary.
    const err = /** @type {{ statusMessage?: string, message?: string }} */ (body ?? {})
    const message = err.statusMessage ?? err.message ?? `HTTP ${res.status}`
    emit({ error: { status: res.status, message } })
    return 1
  }
  emit(body)
  return 0
}

// Entrypoint — skipped when imported by tests. Session cached repo-local at `.cairn/`.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  run(process.argv.slice(2), { fetch, configDir: '.cairn', env: process.env, out: process.stdout })
    .then(code => process.exit(code))
    .catch((err) => {
      process.stderr.write(`${err?.message ?? err}\n`)
      process.exit(1)
    })
}
