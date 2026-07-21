import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// @ts-expect-error — bin/cairn.mjs is checkJs'd via bin/tsconfig.json, not the app project.
import { run } from '../bin/cairn.mjs'

// ── Stub API (zero network) ────────────────────────────────────────────────
// The CLI is an HTTP client; we inject `fetch`, so no server and no sockets. Each route is keyed
// `METHOD /pathname` and returns a minimal WHATWG-Response-shaped object.

/** @param {Record<string, (ctx: { body: unknown }) => any>} routes */
function stubFetch(routes: Record<string, (ctx: { body: unknown }) => unknown>) {
  const calls: Array<{ url: string; method: string; headers: Record<string, string>; body: unknown }> = []
  const fetch = async (url: string | URL, opts: { method?: string; headers?: Record<string, string>; body?: string } = {}) => {
    const method = opts.method ?? 'GET'
    const body = opts.body ? JSON.parse(opts.body) : undefined
    calls.push({ url: String(url), method, headers: opts.headers ?? {}, body })
    const key = `${method} ${new URL(String(url)).pathname}`
    const handler = routes[key]
    if (!handler) throw new Error(`unexpected request: ${key}`)
    return handler({ body })
  }
  return Object.assign(fetch, { calls })
}

function res(status: number, body: unknown, headers: Record<string, string> = {}) {
  const h = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]))
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (k: string) => h.get(k.toLowerCase()) ?? null },
    async json() { return body },
    async text() { return typeof body === 'string' ? body : JSON.stringify(body) },
  }
}

function capture() {
  let buf = ''
  return { write(s: string) { buf += s; return true }, get text() { return buf } }
}

const URL_BASE = 'http://localhost:3000'
function seedSession(dir: string, cookie: string) { writeFileSync(join(dir, 'session.json'), JSON.stringify({ cookie })) }

describe('cairn CLI', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cairn-cli-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('features → GET /api/features, prints the JSON payload', async () => {
    // Seeded session → no login needed (login-on-first-use is a later slice).
    seedSession(dir, 'nuxt-session=abc')
    const features = [{ id: 'f1', title: 'Onboarding', status: 'shaping' }]
    const fetch = stubFetch({ 'GET /api/features': () => res(200, features) })
    const out = capture()

    const code = await run(['features'], { fetch, configDir: dir, env: { CAIRN_URL: URL_BASE }, out })

    expect(code).toBe(0)
    expect(fetch.calls).toHaveLength(1)
    expect(fetch.calls[0].url).toBe(`${URL_BASE}/api/features`)
    expect(JSON.parse(out.text)).toEqual(features)
  })

  it('no cookie → logs in with env creds, persists the cookie, attaches it to the read', async () => {
    const features = [{ id: 'f1' }]
    const fetch = stubFetch({
      'POST /api/auth/login': ({ body }) => {
        expect(body).toEqual({ email: 'agent@cairn.local', password: 'secret' })
        return res(200, { ok: true, user: { name: 'Agent', role: 'member' } }, { 'set-cookie': 'nuxt-session=xyz; Path=/; HttpOnly' })
      },
      'GET /api/features': () => res(200, features),
    })
    const out = capture()

    const code = await run(['features'], {
      fetch, configDir: dir, out,
      env: { CAIRN_URL: URL_BASE, CAIRN_EMAIL: 'agent@cairn.local', CAIRN_PASSWORD: 'secret' },
    })

    expect(code).toBe(0)
    // Login first, then the read.
    expect(fetch.calls.map(c => `${c.method} ${new URL(c.url).pathname}`)).toEqual(['POST /api/auth/login', 'GET /api/features'])
    // Only the name=value pair is forwarded (cookie attributes stripped).
    expect(fetch.calls[1].headers.cookie).toBe('nuxt-session=xyz')
    // Persisted for next time.
    expect(JSON.parse(readFileSync(join(dir, 'session.json'), 'utf8')).cookie).toBe('nuxt-session=xyz')
  })

  it('multiple Set-Cookie headers → uses getSetCookie(), not the comma-joined get()', async () => {
    const features = [{ id: 'f1' }]
    // The stub deliberately makes get() and getSetCookie() DISAGREE: undici comma-joins multiple
    // Set-Cookie via get(), so the CLI must prefer getSetCookie(). If it regressed to get(), the
    // attached cookie would be the decoy below and this test would fail.
    const loginRes = {
      status: 200, ok: true,
      headers: {
        get: (k: string) => (k.toLowerCase() === 'set-cookie' ? 'decoy=WRONG; Path=/' : null),
        getSetCookie: () => ['nuxt-session=real; Path=/; HttpOnly', 'csrf=zzz; Path=/'],
      },
      async json() { return { ok: true } }, async text() { return '' },
    }
    const fetch = stubFetch({
      'POST /api/auth/login': () => loginRes,
      'GET /api/features': () => res(200, features),
    })
    const out = capture()

    const code = await run(['features'], {
      fetch, configDir: dir, out,
      env: { CAIRN_URL: URL_BASE, CAIRN_EMAIL: 'a@b.c', CAIRN_PASSWORD: 'p' },
    })

    expect(code).toBe(0)
    // The first (session) cookie is attached and cached — never the decoy from get().
    expect(fetch.calls[1].headers.cookie).toBe('nuxt-session=real')
    expect(JSON.parse(readFileSync(join(dir, 'session.json'), 'utf8')).cookie).toBe('nuxt-session=real')
  })

  it('stale cookie → 401 triggers transparent re-login and one retry, refreshed cookie persisted', async () => {
    seedSession(dir, 'nuxt-session=stale')
    const features = [{ id: 'f1' }]
    let featuresHits = 0
    const fetch = stubFetch({
      'GET /api/features': () => {
        featuresHits += 1
        return featuresHits === 1 ? res(401, { message: 'Unauthorized' }) : res(200, features)
      },
      'POST /api/auth/login': () => res(200, { ok: true }, { 'set-cookie': 'nuxt-session=fresh; Path=/' }),
    })
    const out = capture()

    const code = await run(['features'], {
      fetch, configDir: dir, out,
      env: { CAIRN_URL: URL_BASE, CAIRN_EMAIL: 'a@b.c', CAIRN_PASSWORD: 'p' },
    })

    expect(code).toBe(0)
    // Stale read → login → retry with the fresh cookie.
    expect(fetch.calls.map(c => `${c.method} ${new URL(c.url).pathname}`)).toEqual(['GET /api/features', 'POST /api/auth/login', 'GET /api/features'])
    expect(fetch.calls[0].headers.cookie).toBe('nuxt-session=stale')
    expect(fetch.calls[2].headers.cookie).toBe('nuxt-session=fresh')
    expect(JSON.parse(out.text)).toEqual(features)
    expect(JSON.parse(readFileSync(join(dir, 'session.json'), 'utf8')).cookie).toBe('nuxt-session=fresh')
  })

  it('capture "<text>" → POST /api/intake/turn with the message, prints the turn response', async () => {
    seedSession(dir, 'nuxt-session=abc')
    const turn = { session_id: 's1', state: 'clarify', agent_message: 'Quelle est la priorité ?', proposal: null }
    const fetch = stubFetch({
      'POST /api/intake/turn': ({ body }) => {
        expect(body).toEqual({ message: 'les utilisateurs veulent le mode sombre', source: 'agent' })
        return res(200, turn)
      },
    })
    const out = capture()

    const code = await run(['capture', 'les utilisateurs veulent le mode sombre'], { fetch, configDir: dir, out, env: { CAIRN_URL: URL_BASE } })

    expect(code).toBe(0)
    expect(fetch.calls).toHaveLength(1)
    expect(JSON.parse(out.text)).toEqual(turn)
  })

  it('capture --session <id> "<reply>" → continues the turn, forwarding session_id', async () => {
    seedSession(dir, 'nuxt-session=abc')
    const turn = { session_id: 's1', state: 'propose', agent_message: 'Voici ma proposition', proposal: { action: 'create' } }
    const fetch = stubFetch({
      'POST /api/intake/turn': ({ body }) => {
        expect(body).toEqual({ message: 'priorité haute', session_id: 's1', source: 'agent' })
        return res(200, turn)
      },
    })
    const out = capture()

    const code = await run(['capture', '--session', 's1', 'priorité haute'], { fetch, configDir: dir, out, env: { CAIRN_URL: URL_BASE } })

    expect(code).toBe(0)
    expect(JSON.parse(out.text)).toEqual(turn)
  })

  it('commit --session <id> → POST /api/intake/commit with session_id', async () => {
    seedSession(dir, 'nuxt-session=abc')
    const committed = { session_id: 's1', state: 'committed', feature_id: 'f9' }
    const fetch = stubFetch({
      'POST /api/intake/commit': ({ body }) => {
        expect(body).toEqual({ session_id: 's1' })
        return res(200, committed)
      },
    })
    const out = capture()

    const code = await run(['commit', '--session', 's1'], { fetch, configDir: dir, out, env: { CAIRN_URL: URL_BASE } })

    expect(code).toBe(0)
    expect(JSON.parse(out.text)).toEqual(committed)
  })

  it('capture that decomposes → batch_review surfaced; commit-batch posts the selected segments', async () => {
    seedSession(dir, 'nuxt-session=abc')
    // Multi-topic input auto-decomposes: state is batch_review, proposal is null, segments carry ids.
    const batchTurn = {
      session_id: 's1', state: 'batch_review', agent_message: 'Deux sujets détectés', proposal: null,
      batch: { session_id: 's1', segments: [{ id: 'seg1' }, { id: 'seg2' }] },
    }
    const committed = { created: 2, updated: 0, discarded: 0, results: [] }
    const fetch = stubFetch({
      'POST /api/intake/turn': () => res(200, batchTurn),
      'POST /api/intake/commit-batch': ({ body }) => {
        // The selected segment ids are forwarded as the selection array the endpoint expects.
        expect(body).toEqual({ session_id: 's1', segments: [{ id: 'seg1' }, { id: 'seg2' }] })
        return res(200, committed)
      },
    })

    const outT = capture()
    expect(await run(['capture', 'A et B'], { fetch, configDir: dir, out: outT, env: { CAIRN_URL: URL_BASE } })).toBe(0)
    expect(JSON.parse(outT.text)).toEqual(batchTurn) // batch state is surfaced, not swallowed

    const outC = capture()
    expect(await run(['commit-batch', '--session', 's1', '--segments', 'seg1,seg2'], { fetch, configDir: dir, out: outC, env: { CAIRN_URL: URL_BASE } })).toBe(0)
    expect(JSON.parse(outC.text)).toEqual(committed)
  })

  it('commit / commit-batch without a session → rejected client-side, no request', async () => {
    seedSession(dir, 'nuxt-session=abc')
    const fetch = stubFetch({})

    const out1 = capture()
    expect(await run(['commit'], { fetch, configDir: dir, out: out1, env: { CAIRN_URL: URL_BASE } })).toBe(1)
    expect(JSON.parse(out1.text)).toEqual({ error: { status: 0, message: 'usage: cairn commit --session <id>' } })

    // commit-batch also needs --segments (the ids can't be inferred client-side).
    const out2 = capture()
    expect(await run(['commit-batch', '--session', 's1'], { fetch, configDir: dir, out: out2, env: { CAIRN_URL: URL_BASE } })).toBe(1)
    expect(JSON.parse(out2.text)).toEqual({ error: { status: 0, message: 'usage: cairn commit-batch --session <id> --segments <id,id,…>' } })

    expect(fetch.calls).toHaveLength(0)
  })

  it('--pretty prints indented JSON (compact by default)', async () => {
    seedSession(dir, 'nuxt-session=abc')
    const features = [{ id: 'f1', title: 'Onboarding' }]
    const fetch = stubFetch({ 'GET /api/features': () => res(200, features) })
    const out = capture()

    const code = await run(['features', '--pretty'], { fetch, configDir: dir, out, env: { CAIRN_URL: URL_BASE } })

    expect(code).toBe(0)
    expect(out.text).toBe(`${JSON.stringify(features, null, 2)}\n`) // indented, newline-terminated
  })

  it('non-2xx (non-401) → nonzero exit + JSON error envelope, no re-login', async () => {
    seedSession(dir, 'nuxt-session=abc')
    const fetch = stubFetch({ 'GET /api/features': () => res(400, { statusMessage: 'mauvaise requête' }) })
    const out = capture()

    const code = await run(['features'], { fetch, configDir: dir, out, env: { CAIRN_URL: URL_BASE } })

    expect(code).toBe(1)
    expect(fetch.calls).toHaveLength(1) // a non-401 does NOT trigger re-login
    expect(JSON.parse(out.text)).toEqual({ error: { status: 400, message: 'mauvaise requête' } })
  })

  it('out-of-scope command → rejected client-side, no request, error envelope', async () => {
    seedSession(dir, 'nuxt-session=abc')
    // `members` is a real endpoint but outside the reads + capture surface — the CLI must not reach it.
    const fetch = stubFetch({})
    const out = capture()

    const code = await run(['members'], { fetch, configDir: dir, out, env: { CAIRN_URL: URL_BASE } })

    expect(code).toBe(1)
    expect(fetch.calls).toHaveLength(0) // never hit the network
    expect(JSON.parse(out.text)).toEqual({ error: { status: 0, message: 'commande inconnue : members' } })
  })

  it('feature with no id → usage error, no request', async () => {
    seedSession(dir, 'nuxt-session=abc')
    const fetch = stubFetch({})
    const out = capture()

    const code = await run(['feature'], { fetch, configDir: dir, out, env: { CAIRN_URL: URL_BASE } })

    expect(code).toBe(1)
    expect(fetch.calls).toHaveLength(0)
    expect(JSON.parse(out.text)).toEqual({ error: { status: 0, message: 'usage: cairn feature <id>' } })
  })

  it('failed login → single attempt, no blank cookie cached, surfaces the login 401', async () => {
    // Bad creds: login 401s with no Set-Cookie. A fresh login yielding no cookie short-circuits —
    // no wasted endpoint call, no second login — and the login's own error is what surfaces.
    const fetch = stubFetch({
      'POST /api/auth/login': () => res(401, { statusMessage: 'Identifiants invalides' }),
    })
    const out = capture()

    const code = await run(['features'], {
      fetch, configDir: dir, out,
      env: { CAIRN_URL: URL_BASE, CAIRN_EMAIL: 'a@b.c', CAIRN_PASSWORD: 'wrong' },
    })

    expect(code).toBe(1)
    expect(fetch.calls).toHaveLength(1) // one login, and crucially NOT the read (blank cookie never sent)
    expect(() => readFileSync(join(dir, 'session.json'), 'utf8')).toThrow() // nothing persisted
    expect(JSON.parse(out.text)).toEqual({ error: { status: 401, message: 'Identifiants invalides' } })
  })

  it('betting → GET /api/betting-tables; feature <id> → GET /api/features/<id>', async () => {
    seedSession(dir, 'nuxt-session=abc')
    const table = { hills: [] }
    const feature = { id: 'f1', title: 'Onboarding' }
    const fetch = stubFetch({
      'GET /api/betting-tables': () => res(200, table),
      'GET /api/features/f1': () => res(200, feature),
    })

    const outB = capture()
    expect(await run(['betting'], { fetch, configDir: dir, out: outB, env: { CAIRN_URL: URL_BASE } })).toBe(0)
    expect(JSON.parse(outB.text)).toEqual(table)

    const outF = capture()
    expect(await run(['feature', 'f1'], { fetch, configDir: dir, out: outF, env: { CAIRN_URL: URL_BASE } })).toBe(0)
    expect(JSON.parse(outF.text)).toEqual(feature)
  })

  it('features --status <s> → forwards ?status; omitted means no filter', async () => {
    seedSession(dir, 'nuxt-session=abc')
    const fetch = stubFetch({ 'GET /api/features': () => res(200, []) })

    const out1 = capture()
    expect(await run(['features', '--status', 'shaping'], { fetch, configDir: dir, out: out1, env: { CAIRN_URL: URL_BASE } })).toBe(0)
    expect(new URL(fetch.calls[0].url).search).toBe('?status=shaping')

    const out2 = capture()
    expect(await run(['features'], { fetch, configDir: dir, out: out2, env: { CAIRN_URL: URL_BASE } })).toBe(0)
    expect(new URL(fetch.calls[1].url).search).toBe('')
  })

  it('hills → GET /api/hills; overview → GET /api/overview', async () => {
    seedSession(dir, 'nuxt-session=abc')
    const hills = [{ id: 'h1', name: 'Perf' }]
    const overview = { features: 3, hills: 1 }
    const fetch = stubFetch({
      'GET /api/hills': () => res(200, hills),
      'GET /api/overview': () => res(200, overview),
    })

    const outH = capture()
    expect(await run(['hills'], { fetch, configDir: dir, out: outH, env: { CAIRN_URL: URL_BASE } })).toBe(0)
    expect(JSON.parse(outH.text)).toEqual(hills)

    const outO = capture()
    expect(await run(['overview'], { fetch, configDir: dir, out: outO, env: { CAIRN_URL: URL_BASE } })).toBe(0)
    expect(JSON.parse(outO.text)).toEqual(overview)
  })
})
