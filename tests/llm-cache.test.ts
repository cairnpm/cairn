import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createAnthropicProvider } from '../server/llm/anthropic'
import { llmUsage, recordUsage, resetUsage } from '../server/llm/usage'

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

function stubFetch(usage?: Record<string, number>) {
  sent = []
  globalThis.fetch = (async (_url: string, init: { body: string }) => {
    sent.push(JSON.parse(init.body))
    return {
      ok: true,
      status: 200,
      async json() {
        return { content: [{ type: 'text', text: '{"intent":"signal","target":null}' }], ...(usage ? { usage } : {}) }
      },
    }
    // @ts-expect-error — a minimal Response stand-in, like tests/cli.test.ts (library-shape boundary).
  })
}

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
    stubFetch({ input_tokens: 120, output_tokens: 40, cache_read_input_tokens: 4500, cache_creation_input_tokens: 0 })
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
