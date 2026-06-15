import type { Classification, Proposal } from '../domain/types'
import { localEmbed } from '../utils/embedding'
import type { LlmProvider, ProposeInput } from './provider'
import { createStubProvider, DEDUP_STRONG } from './stub'

/**
 * Anthropic-backed provider (Messages API via raw fetch — no SDK dependency,
 * since this is the optional path; the stub is the default).
 *
 * Embeddings stay local (brief §6) — Anthropic has no embeddings endpoint.
 * Only the reasoning calls (classify / clarify / propose) hit the API, and any
 * failure falls back to the deterministic stub so the gateway never wedges.
 */
const API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5'

async function callClaude(system: string, user: string, maxTokens = 512): Promise<string | null> {
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    })
    if (!res.ok) return null
    const data = await res.json() as { content?: { type: string, text?: string }[] }
    const text = data.content?.find(b => b.type === 'text')?.text
    return text ?? null
  } catch {
    return null
  }
}

/** Pull the first JSON object out of a model reply (handles ```json fences). */
function parseJson<T>(text: string | null): T | null {
  if (!text) return null
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return null
  try { return JSON.parse(m[0]) as T } catch { return null }
}

export function createAnthropicProvider(): LlmProvider {
  const stub = createStubProvider()

  return {
    name: `anthropic:${MODEL}`,
    embed: async (text: string) => localEmbed(text),

    classify: async (content: string) => {
      const text = await callClaude(
        'You classify a raw product signal into exactly one of: musing, explore, directive. '
        + 'musing = vague thought; explore = a feature idea worth shaping; directive = an urgent bug or explicit must-do. '
        + 'Reply with ONLY the single word.',
        content, 16,
      )
      const v = text?.trim().toLowerCase()
      if (v === 'musing' || v === 'explore' || v === 'directive') return v as Classification
      return stub.classify(content)
    },

    clarify: async ({ raw, transcript }) => {
      const askedBefore = transcript.some(t => t.role === 'agent' && t.text.includes('?'))
      if (askedBefore) return null
      const text = await callClaude(
        'You are a product intake agent shaping a raw signal into a bettable feature (Shape Up). '
        + 'If the problem and appetite (small/big) are clear enough to shape, reply exactly "OK". '
        + 'Otherwise reply with ONE short clarifying question (French).',
        `Signal: ${raw}`, 120,
      )
      const t = text?.trim()
      if (!t || t.toUpperCase() === 'OK') return stub.clarify({ raw, transcript })
      return t
    },

    propose: async (input: ProposeInput) => {
      const { raw, candidates, classification, transcript } = input
      const candList = candidates.map(c => `- ${c.feature_id} | ${c.title} | sim=${c.similarity.toFixed(2)}`).join('\n') || '(none)'
      const convo = transcript.map(t => `${t.role}: ${t.text}`).join('\n')
      const text = await callClaude(
        'You route a raw product signal in a Shape Up pipeline. Decide whether to attach it to an existing '
        + `feature or create a new one. Attaching is the default when a candidate similarity is >= ${DEDUP_STRONG}. `
        + 'Reply with ONLY JSON: {"action":"create_feature|append","target_feature_id":string|null,'
        + '"confidence":0-1,"rationale":string,"proposed_spec":{"title":string,"problem":string,'
        + '"appetite":"small|big","out_of_bounds":string}}.',
        `Signal: ${raw}\n\nConversation:\n${convo}\n\nCandidate features:\n${candList}`,
        700,
      )
      const parsed = parseJson<Partial<Proposal>>(text)
      if (!parsed || (parsed.action !== 'create_feature' && parsed.action !== 'append')) {
        return stub.propose(input)
      }
      return {
        action: parsed.action,
        target_feature_id: parsed.action === 'append' ? (parsed.target_feature_id ?? candidates[0]?.feature_id ?? null) : null,
        classification,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : (candidates[0]?.similarity ?? 0.5),
        rationale: parsed.rationale || 'Routing proposé par le modèle.',
        proposed_spec: {
          title: parsed.proposed_spec?.title || raw.trim().slice(0, 60),
          problem: parsed.proposed_spec?.problem || raw.trim(),
          appetite: parsed.proposed_spec?.appetite === 'big' ? 'big' : 'small',
          out_of_bounds: parsed.proposed_spec?.out_of_bounds || '',
        },
        candidates,
      }
    },
  }
}
