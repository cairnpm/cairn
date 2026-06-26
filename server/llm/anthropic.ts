import type { Classification, Proposal } from '../domain/types'
import { localEmbed } from '../utils/embedding'
import { ARCHITECTURE_CONTEXT } from './architecture'
import type { LlmProvider, ProposeInput } from './provider'
import { createStubProvider, DEDUP_STRONG } from './stub'

/**
 * Anthropic-backed provider (Messages API via raw fetch — no SDK dependency).
 * Embeddings stay local (brief §6). Reasoning calls hit the API with a STRICT
 * structured-output schema + low temperature (deterministic routing); any failure
 * falls back to the deterministic stub so the gateway never wedges.
 */
const API_URL = 'https://api.anthropic.com/v1/messages'
const MAX_CLARIFY = 8

interface CallOpts { temperature?: number, schema?: object }

export interface AnthropicConfig { apiKey: string, model: string }

/** Parse a JSON object from a model reply (structured output is already valid; this also handles fences). */
function parseJson<T>(text: string | null): T | null {
  if (!text) return null
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return null
  try { return JSON.parse(m[0]) as T } catch { return null }
}

const nullableString = { anyOf: [{ type: 'string' }, { type: 'null' }] }

const INTENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    intent: { type: 'string', enum: ['query', 'refine', 'signal', 'merge'] },
    target: nullableString,
    target2: nullableString,
  },
  required: ['intent', 'target', 'target2'],
}

const PROPOSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    action: { type: 'string', enum: ['create_feature', 'append', 'discard'] },
    target_feature_id: nullableString,
    confidence: { type: 'number' },
    rationale: { type: 'string' },
    proposed_spec: {
      type: 'object',
      additionalProperties: false,
      properties: {
        title: { type: 'string' },
        problem: { type: 'string' },
        appetite: { type: 'string', enum: ['small', 'big'] },
        solution: { type: 'string' },
        rabbit_holes: { type: 'string' },
        out_of_bounds: { type: 'string' },
      },
      required: ['title', 'problem', 'appetite', 'solution', 'rabbit_holes', 'out_of_bounds'],
    },
  },
  required: ['action', 'target_feature_id', 'confidence', 'rationale', 'proposed_spec'],
}

export function createAnthropicProvider(cfg: AnthropicConfig): LlmProvider {
  const stub = createStubProvider()
  const { apiKey, model } = cfg
  // Opus 4.x / Fable / Mythos reject `temperature`; everything else (Haiku/Sonnet) accepts it.
  const acceptsTemperature = !/(opus-4|fable|mythos)/i.test(model)

  async function callClaude(system: string, user: string, maxTokens = 512, opts: CallOpts = {}): Promise<string | null> {
    const base: Record<string, unknown> = {
      model, max_tokens: maxTokens, system,
      messages: [{ role: 'user', content: user }],
    }
    if (opts.temperature !== undefined && acceptsTemperature) base.temperature = opts.temperature

    const attempt = async (withSchema: boolean): Promise<string | null> => {
      const body = withSchema && opts.schema
        ? { ...base, output_config: { format: { type: 'json_schema', schema: opts.schema } } }
        : base
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      if (!res.ok) return null
      const data = await res.json() as { content?: { type: string, text?: string }[] }
      return data.content?.find(b => b.type === 'text')?.text ?? null
    }

    try {
      let t = await attempt(true)
      // Structured outputs may be unsupported for the model/version → degrade to plain JSON-in-text.
      if (t === null && opts.schema) t = await attempt(false)
      return t
    } catch {
      return null
    }
  }

  async function describeImage(b64: string, mime: string): Promise<string | null> {
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model, max_tokens: 300,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mime, data: b64 } },
              { type: 'text', text: 'Décris en 2-3 phrases ce que montre cette image, dans un contexte produit/logiciel (FR). Sois factuel.' },
            ],
          }],
        }),
      })
      if (!res.ok) return null
      const data = await res.json() as { content?: { type: string, text?: string }[] }
      return data.content?.find(b => b.type === 'text')?.text ?? null
    } catch { return null }
  }

  return {
    name: `anthropic:${model}`,
    embed: async (text: string) => localEmbed(text),

    extractAttachments: async (items) => {
      const chunks: string[] = []
      for (const it of items) {
        if (it.kind === 'image' && it.base64) {
          const desc = await describeImage(it.base64, it.mime)
          if (desc) chunks.push(`Image jointe « ${it.filename} » : ${desc}`)
        } else if (it.text) {
          chunks.push(`Fichier joint « ${it.filename} » :\n${it.text.slice(0, 6000)}`)
        }
      }
      return chunks.join('\n\n')
    },

    detectIntent: async (message: string) => {
      const text = await callClaude(
        'Classify a message to a product backlog gateway into exactly one intent: '
        + '"query" (read-only question about a feature\'s state/progress), '
        + '"refine" (refine/update a NAMED existing feature), '
        + '"merge" (explicitly merge/deduplicate two named features, e.g. "fusionne X et Y", "X est un doublon de Y"), '
        + 'or "signal" (a raw new feedback/feature/bug to route). '
        + 'target = the feature named (for query/refine: the feature; for merge: the feature to ABSORB), else null. '
        + 'target2 = for merge only, the SURVIVING feature (the one kept), else null.',
        message, 100, { temperature: 0, schema: INTENT_SCHEMA },
      )
      if (text === null) return stub.detectIntent(message)
      const p = parseJson<{ intent?: string, target?: string | null, target2?: string | null }>(text)
      if (p && (p.intent === 'query' || p.intent === 'refine' || p.intent === 'signal' || p.intent === 'merge')) {
        return { intent: p.intent, target: p.target ?? null, target2: p.target2 ?? null }
      }
      return stub.detectIntent(message)
    },

    answerQuery: async (question: string, context: string) => {
      const text = await callClaude(
        'You answer a question about a product feature using ONLY the provided state. '
        + 'Be concise and concrete (French), PLAIN TEXT only — no markdown (no **, no #, no markdown bullets). '
        + 'When asked about changes or history, be SPECIFIC: name the actual signal that was added (quote it briefly), '
        + 'say WHICH fields were refined and HOW they changed, and WHO did it — never just "a mis à jour un signal". '
        + 'If the state doesn\'t answer it, say so. Do not invent.',
        `Question: ${question}\n\nÉtat de la feature :\n${context}`, 450,
      )
      return text ?? stub.answerQuery(question, context)
    },

    classify: async (content: string) => {
      const text = await callClaude(
        'You classify a raw product signal into exactly one of: musing, explore, directive. '
        + 'musing = vague thought; explore = a feature idea worth shaping; directive = an urgent bug or explicit must-do. '
        + 'Reply with ONLY the single word.',
        content, 16, { temperature: 0 },
      )
      const v = text?.trim().toLowerCase()
      if (v === 'musing' || v === 'explore' || v === 'directive') return v as Classification
      return stub.classify(content)
    },

    clarify: async ({ raw, transcript }) => {
      const agentQuestions = transcript.filter(t => t.role === 'agent' && t.text.includes('?')).length
      if (agentQuestions >= MAX_CLARIFY) return null
      const convo = transcript.map(t => `${t.role}: ${t.text}`).join('\n')
      const text = await callClaude(
        'You are a Shape Up intake agent turning a raw signal into a bettable feature. Enforce shaping '
        + 'discipline: the pitch must capture the REAL problem (what actually breaks today), the appetite '
        + '(small/big), a solution direction, rabbit holes and explicit no-gos — NOT a reworded request. '
        + 'Ask ONE targeted shaping question at a time, and keep asking — across as many turns as the subject '
        + 'genuinely needs — until you could write a confident pitch. A simple signal may need a single '
        + 'question; an ambiguous or far-reaching one may need several. Do NOT pad with unnecessary questions. '
        + 'As soon as you could write a confident pitch, reply with ONLY the two letters "OK" and NOTHING else — '
        + 'do NOT write the pitch, that is a later step. Otherwise reply with ONE short question (French) ending in "?".',
        `Signal: ${raw}\n\nConversation so far:\n${convo}`, 160, { temperature: 0 },
      )
      if (text === null) return stub.clarify({ raw, transcript })
      const t = text.trim()
      // "Done" signal: an explicit OK (even if the model rambles after it) or a reply with no question.
      // A real clarifying question always ends in "?"; anything else means the model is ready to propose.
      if (!t || /^ok\b/i.test(t) || !t.includes('?')) return null
      return t
    },

    propose: async (input: ProposeInput) => {
      const { raw, candidates, classification, transcript, existing } = input
      const candList = candidates.map(c => `- ${c.feature_id} | ${c.title} | sim=${c.similarity.toFixed(2)}`).join('\n') || '(none)'
      const convo = transcript.map(t => `${t.role}: ${t.text}`).join('\n')
      const existingBlock = existing
        ? `\n\nYou are REFINING this existing feature — preserve what still applies and INTEGRATE the new precision (do not drop context):\n`
          + `title: ${existing.title}\nproblem: ${existing.problem}\nsolution: ${existing.solution}\nrabbit_holes: ${existing.rabbit_holes}\nout_of_bounds: ${existing.out_of_bounds}\nappetite: ${existing.appetite}`
        : ''
      const text = await callClaude(
        `Contexte produit :\n${ARCHITECTURE_CONTEXT}\n\n`
        + 'You route a raw product signal in a Shape Up pipeline, acting as the DEDUP JUDGE. '
        + 'The candidate features below were surfaced by a similarity search — the score is a HINT, not a hard rule '
        + `(ignore the ${DEDUP_STRONG} cosine threshold; judge meaning, not numbers). `
        + 'If ANY candidate addresses the SAME underlying problem/feature as this signal — even worded very '
        + 'differently — choose action "append" and set target_feature_id to that candidate. Choose "create_feature" '
        + 'ONLY when no candidate is genuinely the same feature (creating is a deliberate act — duplicates pollute the backlog). '
        + 'Choose "discard" when the input is noise, out-of-scope, or a semantic duplicate that adds NOTHING new to an '
        + 'existing feature (already fully captured) — set target_feature_id to that feature if relevant. '
        + 'The proposed_spec is a Shape Up pitch grounded in the product context above: real problem (what breaks today), '
        + 'appetite, sketched solution, rabbit_holes (risks), out_of_bounds (no-gos). '
        + 'Write every text field in FRENCH.',
        `Signal: ${raw}\n\nConversation:\n${convo}\n\nCandidate features:\n${candList}${existingBlock}`,
        900, { temperature: 0, schema: PROPOSE_SCHEMA },
      )
      const parsed = parseJson<Partial<Proposal>>(text)
      if (!parsed || (parsed.action !== 'create_feature' && parsed.action !== 'append' && parsed.action !== 'discard')) {
        return stub.propose(input)
      }
      return {
        action: parsed.action,
        target_feature_id: parsed.action === 'create_feature' ? null : (parsed.target_feature_id ?? candidates[0]?.feature_id ?? null),
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
