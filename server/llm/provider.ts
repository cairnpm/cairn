import type { Candidate, Classification, Proposal, TranscriptEntry } from '../domain/types'

export interface ProposeInput {
  raw: string
  transcript: TranscriptEntry[]
  candidates: Candidate[]
  classification: Classification
}

/**
 * Single seam for the LLM. The gateway never talks to a vendor directly — it
 * talks to this interface, so Claude / Gemini / a stub are interchangeable.
 * `embed` stays local for now (brief §6); only reasoning calls hit a vendor.
 */
export interface LlmProvider {
  name: string
  embed: (text: string) => Promise<number[]>
  classify: (content: string) => Promise<Classification>
  /** A single targeted question, or null when the spec is complete enough. */
  clarify: (input: { raw: string; transcript: TranscriptEntry[] }) => Promise<string | null>
  propose: (input: ProposeInput) => Promise<Proposal>
}

let _provider: LlmProvider | null = null

/** Anthropic when ANTHROPIC_API_KEY is set, deterministic stub otherwise. */
export async function getLlm(): Promise<LlmProvider> {
  if (_provider) return _provider
  if (process.env.ANTHROPIC_API_KEY) {
    const { createAnthropicProvider } = await import('./anthropic')
    _provider = createAnthropicProvider()
  } else {
    const { createStubProvider } = await import('./stub')
    _provider = createStubProvider()
  }
  return _provider
}
