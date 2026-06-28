import type { Candidate, Classification, DecomposedSignal, Intent, Proposal, TranscriptEntry, Triage } from '../domain/types'

export interface ProposeInput {
  raw: string
  transcript: TranscriptEntry[]
  candidates: Candidate[]
  classification: Classification
  /** Present when refining a known feature — its current pitch, to merge into. */
  existing?: { title: string; problem: string; solution: string; rabbit_holes: string; out_of_bounds: string; appetite: string }
  /** Read-only roadmap context (active cycles + in-flight features) so the agent routes with the
   *  right picture — and never amends a feature whose scope is frozen in a validated cycle. */
  roadmap?: string
}

/**
 * Single seam for the LLM. The gateway never talks to a vendor directly — it
 * talks to this interface, so Claude / Gemini / a stub are interchangeable.
 * `embed` stays local for now (brief §6); only reasoning calls hit a vendor.
 */
/** A file to turn into intake context: images go to vision, text is inlined. */
export interface AttachmentForLlm {
  kind: 'image' | 'text' | 'other'
  mime: string
  filename: string
  base64?: string
  text?: string
}

export interface LlmProvider {
  name: string
  embed: (text: string) => Promise<number[]>
  /** Turn attached files into French context text (vision for images, inline for text). Optional. */
  extractAttachments?: (items: AttachmentForLlm[]) => Promise<string>
  /** Route the input: a read-only question, a refine of a named feature, or a raw signal. */
  detectIntent: (message: string) => Promise<Intent>
  /** Answer a read-only question about a feature from its current DB state (no writing). */
  answerQuery: (question: string, context: string) => Promise<string>
  classify: (content: string) => Promise<Classification>
  /** A single targeted question, or null when the spec is complete enough. */
  clarify: (input: { raw: string; transcript: TranscriptEntry[] }) => Promise<string | null>
  propose: (input: ProposeInput) => Promise<Proposal>
  /** Triage a raw input: one shapeable problem (single) or several (multi → offer decomposition). */
  triage: (input: { raw: string }) => Promise<Triage>
  /** Carve a dense input (e.g. a transcript) into discrete, recontextualized product signals. */
  decompose: (input: { raw: string; roadmap?: string }) => Promise<DecomposedSignal[]>
}

let _provider: LlmProvider | null = null
let _fingerprint = ''

/** Drop the cached provider so the next getLlm() rebuilds from current settings (call after a settings write). */
export function resetLlm(): void {
  _provider = null
  _fingerprint = ''
}

/**
 * Resolve key + model from runtime settings (DB), falling back to env. Anthropic when a key is
 * present, deterministic stub otherwise. Cached by a key|model fingerprint so changing settings
 * auto-invalidates the cache without a restart — single process, single writer.
 */
export async function getLlm(): Promise<LlmProvider> {
  const { getSetting } = await import('../db/settings')
  const apiKey = getSetting('anthropic_api_key') ?? process.env.ANTHROPIC_API_KEY ?? ''
  const model = getSetting('anthropic_model') ?? process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6'
  const fingerprint = `${apiKey ? 'anthropic' : 'stub'}|${model}|${apiKey}`

  if (_provider && fingerprint === _fingerprint) return _provider
  _fingerprint = fingerprint

  if (apiKey) {
    const { createAnthropicProvider } = await import('./anthropic')
    _provider = createAnthropicProvider({ apiKey, model })
  } else {
    const { createStubProvider } = await import('./stub')
    _provider = createStubProvider()
  }
  return _provider
}
