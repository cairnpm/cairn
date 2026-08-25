// Token-usage counters for the Anthropic provider. In-memory and process-local by design: this
// answers "is the prompt cache actually working?", which is a question about the running process,
// not a durable product fact — so it stays out of SQLite and off the one write path.
//
// Surfaced by /api/metrics. Resets on restart.

export interface UsageTotals {
  calls: number
  input: number        // uncached input tokens, billed at full price
  output: number
  cache_read: number   // served from cache — ~0.1x the input price
  cache_write: number  // written to cache — ~1.25x, paid once per entry
}

const totals: UsageTotals = { calls: 0, input: 0, output: 0, cache_read: 0, cache_write: 0 }

/** Anthropic's `usage` block. Cache fields are absent on a request that neither read nor wrote. */
interface ApiUsage {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}

export function recordUsage(u: ApiUsage | undefined): void {
  if (!u) return
  totals.calls += 1
  totals.input += u.input_tokens ?? 0
  totals.output += u.output_tokens ?? 0
  totals.cache_read += u.cache_read_input_tokens ?? 0
  totals.cache_write += u.cache_creation_input_tokens ?? 0
}

/**
 * Totals plus the one number worth watching: the share of prompt tokens served from cache.
 * A hit rate stuck at 0 across repeated calls means something is invalidating the prefix — the
 * prompts are below the model's minimum cacheable size, or a volatile value crept into the system
 * prompt. That's the whole reason these counters exist.
 */
export function llmUsage(): UsageTotals & { cache_hit_rate: number } {
  // Every prompt token is billed exactly once, as one of these three. Leaving `cache_write` out of the
  // denominator would flatter the rate: a workload idle enough that entries expire between calls pays
  // the 1.25x write over and over, and would still report a near-perfect hit rate.
  const prompt = totals.input + totals.cache_read + totals.cache_write
  return { ...totals, cache_hit_rate: prompt ? Number((totals.cache_read / prompt).toFixed(3)) : 0 }
}

/** Tests only. */
export function resetUsage(): void {
  totals.calls = 0; totals.input = 0; totals.output = 0; totals.cache_read = 0; totals.cache_write = 0
}
