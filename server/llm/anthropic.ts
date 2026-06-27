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
        'You answer a question about the PRODUCT — its backlog, cycles (Hills), in-flight and shipped work, '
        + 'or a specific feature — using ONLY the provided state snapshot. '
        + 'Be concise and concrete (French), PLAIN TEXT only — no markdown (no **, no #, no markdown bullets). '
        + 'Use the relevant part of the snapshot for the question (a roadmap/backlog question vs a single feature). '
        + 'When asked about changes or history, be SPECIFIC: name the actual signal that was added (quote it briefly), '
        + 'say WHICH fields were refined and HOW they changed, and WHO did it — never just "a mis à jour un signal". '
        + 'If the snapshot doesn\'t answer it, say so. Do not invent.',
        `Question: ${question}\n\nÉtat du produit (snapshot) :\n${context}`, 500,
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
        'You are a SENIOR product manager doing Shape Up intake — NOT an order-taker. Do not accept the '
        + 'request at face value and do not flatter; your job is to protect a finite roadmap. First reframe the '
        + 'request into the underlying PROBLEM (what concretely breaks today, for whom, how often) — never jump '
        + 'to the solution. Then challenge it like a PM defending that roadmap: does the problem really matter? '
        + 'why now rather than something else? what is the cost of doing THIS instead? what does success look '
        + 'like? Interrogate the APPETITE (small = days / big = weeks) and whether it is justified. If the idea '
        + 'is unbounded (open rabbit holes, unclear success, scope that could balloon), surface it — do not '
        + 'pretend it is ready to bet. A bettable pitch is rough + solved + bounded (real problem, appetite, '
        + 'solution direction, rabbit holes, explicit no-gos), NOT a reworded request. '
        + 'Ask ONE sharp question at a time (French, ending in "?"), and keep challenging across as many turns as '
        + 'the subject genuinely needs — a clear signal may need one, a vague or far-reaching one several. Do NOT '
        + 'pad with filler. As soon as you could write a confident, bounded pitch — OR conclude there is no real '
        + 'problem to shape (pure noise) — reply with ONLY "OK" and nothing else (do NOT write the pitch, that is a '
        + 'later step). Note: a low-priority but real problem is still worth shaping — timing is decided later at betting.',
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
      const { raw, candidates, classification, transcript, existing, roadmap } = input
      const candList = candidates.map(c => `- ${c.feature_id} | ${c.title} | sim=${c.similarity.toFixed(2)}`).join('\n') || '(none)'
      const convo = transcript.map(t => `${t.role}: ${t.text}`).join('\n')
      const existingBlock = existing
        ? `\n\nYou are REFINING this existing feature — preserve what still applies and INTEGRATE the new precision (do not drop context):\n`
          + `title: ${existing.title}\nproblem: ${existing.problem}\nsolution: ${existing.solution}\nrabbit_holes: ${existing.rabbit_holes}\nout_of_bounds: ${existing.out_of_bounds}\nappetite: ${existing.appetite}`
        : ''
      const roadmapBlock = roadmap ? `\n\nRoadmap (READ-ONLY context):\n${roadmap}` : ''
      const text = await callClaude(
        `Contexte produit :\n${ARCHITECTURE_CONTEXT}\n\n`
        + 'You route a raw product signal in a Shape Up pipeline, acting as a critical PM and the DEDUP JUDGE — '
        + 'NOT a yes-man. Prioritise the CORRECT routing decision over agreeing with the user. '
        + 'The candidate features below were surfaced by a similarity search — the score is a HINT, not a hard rule '
        + `(ignore the ${DEDUP_STRONG} cosine threshold; judge meaning, not numbers). `
        + 'If ANY candidate addresses the SAME underlying problem/feature as this signal — even worded very '
        + 'differently — choose action "append" and set target_feature_id to that candidate. Choose "create_feature" '
        + 'ONLY when no candidate is genuinely the same feature (creating is a deliberate act — duplicates pollute the backlog). '
        + 'Choose "discard" ONLY for genuine noise — spam, empty/test input, or chatter that is not about this '
        + 'product — or an exact duplicate that adds NOTHING new to an existing feature. '
        + 'A BUG report is IN SCOPE: shape it into a feature/pitch (the problem IS the bug); NEVER discard a bug or '
        + 'claim it belongs in another tool (Jira, ticketing, "issue tracker") — the intake is the team\'s entry point '
        + 'for bugs too. "Out-of-scope" means genuinely not about this product, NOT "this is a bug, not a feature". '
        + 'Do NOT discard a legitimate problem because it looks low-priority or "not now": shaping a feature is NOT a '
        + 'commitment to build it — prioritisation and timing are decided later at the betting table. '
        + 'Default strongly to CAPTURING real problems (append to the right feature, or create a new one). '
        + 'ROADMAP CONTEXT is read-only: features already committed to a cycle have a FROZEN scope — NEVER append to them; '
        + 'a signal about one of them is a NEW feature for a later cycle (create_feature), or a discard if it adds nothing. '
        + 'In the rationale, reason like a PM: state your key ASSUMPTIONS and any MISSING context the human should confirm, '
        + 'and separate fact from interpretation. '
        + 'The proposed_spec is a Shape Up pitch grounded in the product context above: real problem (what breaks today), '
        + 'appetite, sketched solution, rabbit_holes (risks), out_of_bounds (no-gos). '
        + 'Write every text field in FRENCH.',
        `Signal: ${raw}\n\nConversation:\n${convo}\n\nCandidate features:\n${candList}${existingBlock}${roadmapBlock}`,
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
