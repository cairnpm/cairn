import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createAnthropicProvider } from '../server/llm/anthropic'
import { llmUsage, recordUsage, resetUsage } from '../server/llm/usage'
import { ensureSchema } from '../server/db/schema'

// Zero network: global fetch is stubbed and restored. These assert the REQUEST SHAPE — that the
// cache breakpoint actually leaves the process — because a missing `cache_control` fails silently
// (full price, no error), which is exactly how this went unnoticed in the first place.

const realFetch = globalThis.fetch
let sent: Record<string, unknown>[]

/** The system block of request `i`, failing loudly if it isn't the cacheable array shape — otherwise
 *  a regression to a plain `system` string would let the assertions below pass on a substring. */
function systemBlock(i: number): { type: string, text: string, cache_control?: { type: string } } {
  const system = sent[i]?.system
  if (!Array.isArray(system) || !system.length) throw new Error(`request ${i}: system is not a content-block array`)
  const block = system[0]
  if (typeof block !== 'object' || block === null || typeof (block as { text?: unknown }).text !== 'string') {
    throw new Error(`request ${i}: first system block has no text`)
  }
  return block as { type: string, text: string, cache_control?: { type: string } }
}

interface StubReply { status?: number, headers?: Record<string, string>, usage?: Record<string, number> }

let signals: (AbortSignal | undefined)[]

/**
 * Stub `fetch` with a scripted sequence of replies; the last one repeats once the script runs out,
 * so a test only has to describe the failures it cares about.
 */
function stubFetch(...script: StubReply[]) {
  sent = []
  signals = []
  const replies = script.length ? script : [{}]
  globalThis.fetch = (async (_url: string, init: { body: string, signal?: AbortSignal }) => {
    const reply = replies[Math.min(sent.length, replies.length - 1)] ?? {}
    sent.push(JSON.parse(init.body))
    signals.push(init.signal)
    const status = reply.status ?? 200
    const headers = new Headers(reply.headers ?? {})
    return {
      ok: status >= 200 && status < 300,
      status,
      headers,
      async json() {
        return { content: [{ type: 'text', text: '{"intent":"signal","target":null}' }], ...(reply.usage ? { usage: reply.usage } : {}) }
      },
    }
    // @ts-expect-error — a minimal Response stand-in, like tests/cli.test.ts (library-shape boundary).
  })
}

const provider = () => createAnthropicProvider({ apiKey: 'sk-test', model: 'claude-sonnet-4-6' })

// `productContext()` reads the settings table, so the schema has to exist (same as the other suites).
beforeAll(() => ensureSchema())
beforeEach(() => resetUsage())
afterEach(() => { globalThis.fetch = realFetch })

describe('prompt caching', () => {
  it('marks the system prompt with an ephemeral cache breakpoint', async () => {
    stubFetch()
    const llm = createAnthropicProvider({ apiKey: 'sk-test', model: 'claude-sonnet-4-6' })
    await llm.detectIntent('les users veulent le mode sombre')

    expect(systemBlock(0)).toMatchObject({ type: 'text', cache_control: { type: 'ephemeral' } })
    expect(systemBlock(0).text.length).toBeGreaterThan(100)
  })

  it('keeps the volatile signal out of the cached prefix', async () => {
    stubFetch()
    const llm = createAnthropicProvider({ apiKey: 'sk-test', model: 'claude-sonnet-4-6' })
    await llm.detectIntent('un signal bien particulier')

    // The prefix must not move between calls, or every request pays the write premium and reads nothing.
    expect(systemBlock(0).text).not.toContain('un signal bien particulier')
    expect(JSON.stringify(sent[0]?.messages)).toContain('un signal bien particulier')
  })

  it('keeps the roadmap out of the decompose prefix — it moves whenever a feature does', async () => {
    stubFetch()
    const llm = createAnthropicProvider({ apiKey: 'sk-test', model: 'claude-sonnet-4-6' })
    await llm.decompose({ raw: 'compte-rendu', roadmap: 'ROADMAP-MARKER-42', code: '', lang: 'fr' })

    expect(systemBlock(0).text).not.toContain('ROADMAP-MARKER-42')
    expect(JSON.stringify(sent[0]?.messages)).toContain('ROADMAP-MARKER-42')
  })

  it('holds the prefix steady while the volatile context changes underneath', async () => {
    stubFetch()
    const llm = createAnthropicProvider({ apiKey: 'sk-test', model: 'claude-sonnet-4-6' })
    await llm.decompose({ raw: 'a', roadmap: 'roadmap v1', code: '', lang: 'fr' })
    await llm.decompose({ raw: 'b', roadmap: 'roadmap v2 — une feature a bougé', code: 'src/x.ts:1', lang: 'fr' })

    // Same prefix despite a different roadmap and code block → the second call reads the cache.
    expect(JSON.stringify(systemBlock(0))).toBe(JSON.stringify(systemBlock(1)))
  })

  it('sends a byte-identical system prefix across calls', async () => {
    stubFetch()
    const llm = createAnthropicProvider({ apiKey: 'sk-test', model: 'claude-sonnet-4-6' })
    await llm.detectIntent('premier signal')
    await llm.detectIntent('second signal, totalement différent')

    expect(sent).toHaveLength(2)
    expect(JSON.stringify(systemBlock(0))).toBe(JSON.stringify(systemBlock(1)))
  })
})

describe('usage counters', () => {
  it('accumulates what the API reports, cache fields included', async () => {
    stubFetch({ usage: { input_tokens: 120, output_tokens: 40, cache_read_input_tokens: 4500, cache_creation_input_tokens: 0 } })
    const llm = createAnthropicProvider({ apiKey: 'sk-test', model: 'claude-sonnet-4-6' })
    await llm.detectIntent('a')
    await llm.detectIntent('b')

    const u = llmUsage()
    expect(u.calls).toBe(2)
    expect(u.input).toBe(240)
    expect(u.output).toBe(80)
    expect(u.cache_read).toBe(9000)
    // 9000 cached / (9000 + 240) prompt tokens
    expect(u.cache_hit_rate).toBeCloseTo(0.974, 3)
  })

  it('reports a zero hit rate when nothing is cached — the signal that caching is broken', () => {
    recordUsage({ input_tokens: 5000, output_tokens: 100 })
    expect(llmUsage().cache_hit_rate).toBe(0)
    expect(llmUsage().cache_write).toBe(0)
  })

  it('ignores a response with no usage block', () => {
    recordUsage(undefined)
    expect(llmUsage().calls).toBe(0)
  })
})

describe('transient-failure handling', () => {
  it('retries an overloaded server, then succeeds', async () => {
    stubFetch({ status: 529 }, { status: 200 })
    await provider().detectIntent('x')
    expect(sent).toHaveLength(2)
  })

  it('does not retry a non-transient failure — an auth error is not going to fix itself', async () => {
    stubFetch({ status: 401 })
    await provider().detectIntent('x')
    expect(sent).toHaveLength(1)
  })

  it('waits as long as the server asked on a 429', async () => {
    stubFetch({ status: 429, headers: { 'retry-after': '1' } }, { status: 200 })
    const started = Date.now()
    await provider().detectIntent('x')
    // Blind backoff would have retried after ~400ms, burning an attempt against a server that told
    // us exactly how long to hold off.
    expect(Date.now() - started).toBeGreaterThanOrEqual(900)
    expect(sent).toHaveLength(2)
  })

  it('probes structured output once, then stops offering it to a model that rejected it', async () => {
    stubFetch({ status: 400 }, { status: 200 })
    const llm = provider()
    await llm.detectIntent('un signal')   // 400 with schema → degrade → succeed without it
    await llm.detectIntent('un autre')    // must go straight out, no second probe
    expect(sent).toHaveLength(3)
    expect(sent[0]).toHaveProperty('output_config')
    expect(sent[1]).not.toHaveProperty('output_config')
    expect(sent[2]).not.toHaveProperty('output_config')
  })

  it('gives up instead of sleeping out a retry-after longer than an interactive turn can wait', async () => {
    stubFetch({ status: 429, headers: { 'retry-after': '300' } })
    const started = Date.now()
    await provider().detectIntent('x')
    // Clamping to a 30s cap and retrying would stall ~90s AND retry prematurely — worse on both
    // counts than the blind backoff it replaced.
    expect(Date.now() - started).toBeLessThan(1000)
    expect(sent).toHaveLength(1)
  })

  it('does not latch structured output off when the schemaless retry fails too', async () => {
    // An over-long input 400s whatever the schema. Latching on that would silently disable
    // structured output for every later call in the process.
    stubFetch({ status: 400 }, { status: 400 }, { status: 200 })
    const llm = provider()
    await llm.detectIntent('un signal démesuré')
    sent = []
    await llm.detectIntent('un signal normal')
    expect(sent[0]).toHaveProperty('output_config')
  })

  it('gives every request a deadline so a stalled call cannot hang the intake turn', async () => {
    stubFetch()
    await provider().detectIntent('x')
    expect(signals[0]).toBeInstanceOf(AbortSignal)
  })
})

describe('decompose prompt', () => {
  it('tells the model the roadmap is context, not source material', async () => {
    stubFetch()
    await provider().decompose({ raw: 'compte-rendu', roadmap: 'R', code: '', lang: 'fr' })
    // The block now sits next to the text the model is told to extract signals from, so the rule
    // that keeps planned features from being re-emitted has to be stated. It is static, so it
    // stays inside the cached prefix.
    expect(systemBlock(0).text).toContain('never source material')
  })
})

describe('cache hit rate', () => {
  it('counts write tokens in the denominator — they are prompt tokens too', () => {
    // 5 mints + 5 reads: half the prompt spend went to the 1.25x write premium.
    recordUsage({ cache_creation_input_tokens: 4600, input_tokens: 200 })
    recordUsage({ cache_read_input_tokens: 4600, input_tokens: 200 })
    // Excluding writes would report 0.92 and hide it.
    expect(llmUsage().cache_hit_rate).toBeCloseTo(0.479, 2)
  })
})
