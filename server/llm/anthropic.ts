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
const MAX_CLARIFY = 8 // safety bound on shaping questions (Claude decides convergence below this)

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
      // Claude decides how many shaping questions are needed (simple subjects: 1;
      // complex ones: several). MAX_CLARIFY is only a safety bound against looping.
      const agentQuestions = transcript.filter(t => t.role === 'agent' && t.text.includes('?')).length
      if (agentQuestions >= MAX_CLARIFY) return null // safety: force a proposal
      const convo = transcript.map(t => `${t.role}: ${t.text}`).join('\n')
      const text = await callClaude(
        'You are a Shape Up intake agent turning a raw signal into a bettable feature. Enforce shaping '
        + 'discipline: the pitch must capture the REAL problem (what actually breaks today), the appetite '
        + '(small/big), a solution direction, rabbit holes and explicit no-gos — NOT a reworded request. '
        + 'Ask ONE targeted shaping question at a time, and keep asking — across as many turns as the subject '
        + 'genuinely needs — until you could write a confident pitch. A simple signal may need a single '
        + 'question; an ambiguous or far-reaching one may need several. Do NOT pad with unnecessary questions. '
        + 'Reply EXACTLY "OK" as soon as you have enough to shape; otherwise reply with ONE short question (French).',
        `Signal: ${raw}\n\nConversation so far:\n${convo}`, 160,
      )
      if (text === null) return stub.clarify({ raw, transcript }) // API failed → heuristic fallback
      const t = text.trim()
      if (!t || t.toUpperCase() === 'OK') return null // ready → propose
      return t
    },

    propose: async (input: ProposeInput) => {
      const { raw, candidates, classification, transcript } = input
      const candList = candidates.map(c => `- ${c.feature_id} | ${c.title} | sim=${c.similarity.toFixed(2)}`).join('\n') || '(none)'
      const convo = transcript.map(t => `${t.role}: ${t.text}`).join('\n')
      const text = await callClaude(
        'You route a raw product signal in a Shape Up pipeline, acting as the DEDUP JUDGE. '
        + 'The candidate features below were surfaced by a similarity search — the score is a HINT, not a hard rule '
        + `(ignore the ${DEDUP_STRONG} cosine threshold; judge meaning, not numbers). `
        + 'If ANY candidate addresses the SAME underlying problem/feature as this signal — even worded very '
        + 'differently — choose action "append" and set target_feature_id to that candidate. Choose "create_feature" '
        + 'ONLY when no candidate is genuinely the same feature. When hesitating between a close candidate and '
        + 'creating, prefer append — creating a new feature is a deliberate act, and duplicates pollute the backlog. '
        + 'The proposed_spec is a Shape Up pitch — pack in as much shaping context as possible so the feature '
        + 'can be created AND bet on: a real problem statement (what breaks today), the appetite, a sketched '
        + 'solution (core approach), rabbit_holes (risks/pitfalls), and out_of_bounds (no-gos). '
        + 'Write every text field (title, problem, solution, rabbit_holes, out_of_bounds, rationale) in FRENCH. '
        + 'Reply with ONLY JSON: {"action":"create_feature|append","target_feature_id":string|null,'
        + '"confidence":0-1,"rationale":string,"proposed_spec":{"title":string,"problem":string,'
        + '"appetite":"small|big","solution":string,"rabbit_holes":string,"out_of_bounds":string}}.',
        `Signal: ${raw}\n\nConversation:\n${convo}\n\nCandidate features:\n${candList}`,
        900,
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
          solution: parsed.proposed_spec?.solution || '',
          rabbit_holes: parsed.proposed_spec?.rabbit_holes || '',
          out_of_bounds: parsed.proposed_spec?.out_of_bounds || '',
        },
        candidates,
      }
    },
  }
}
