import type { Classification, DecomposedSignal, Proposal, Triage } from '../domain/types'
import { localEmbed } from '../utils/embedding'
import { getSetting } from '../db/settings'
import { ARCHITECTURE_CONTEXT } from './architecture'

// Product framing injected into every shaping/answer prompt — the workspace's OWN description (set in
// Settings), falling back to the generic default. So the agent reasons about THIS product, not a
// hardcoded one. Read per-call (cheap) so edits take effect without a restart.
function productContext(): string {
  return getSetting('product_context')?.trim() || ARCHITECTURE_CONTEXT
}
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
    // proposed_spec BEFORE confidence/rationale: structured output emits fields in schema order, so the
    // pitch is generated FIRST. A verbose rationale then can't truncate the spec away when a big signal
    // pushes the response toward max_tokens (the failure mode that silently degraded routing to the stub).
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
    confidence: { type: 'number' },
    rationale: { type: 'string' },
  },
  required: ['action', 'target_feature_id', 'proposed_spec', 'confidence', 'rationale'],
}

const TRIAGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    mode: { type: 'string', enum: ['single', 'multi'] },
    count: { type: 'number' },
    reason: { type: 'string' },
  },
  required: ['mode', 'count', 'reason'],
}

const DECOMPOSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    signals: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          problem: { type: 'string' },
          classification: { type: 'string', enum: ['musing', 'explore', 'directive'] },
          clarifying_question: nullableString,
        },
        required: ['title', 'problem', 'classification', 'clarifying_question'],
      },
    },
  },
  required: ['signals'],
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

    const attempt = async (withSchema: boolean): Promise<{ ok: true, text: string | null } | { ok: false, status: number }> => {
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
      if (!res.ok) return { ok: false, status: res.status }
      const data = await res.json() as { content?: { type: string, text?: string }[] }
      return { ok: true, text: data.content?.find(b => b.type === 'text')?.text ?? null }
    }

    // Bounded retry with backoff on TRANSIENT failures (rate limit / overload / 5xx). Without this,
    // a single 429/529 silently degrades routing to the deterministic stub — which is why a rapid
    // batch (decompose → N propose calls) loses the smart dedup judge. 400 = schema unsupported →
    // degrade to plain JSON-in-text once (not retried). Other 4xx (auth) → give up → caller stubs.
    const MAX_ATTEMPTS = 4
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      try {
        let r = await attempt(true)
        if (!r.ok && r.status === 400 && opts.schema) { console.warn(`[llm] schema request 400 → retry without schema (attempt ${i})`); r = await attempt(false) }
        if (r.ok) return r.text
        console.warn(`[llm] callClaude non-ok status=${r.status} schema=${!!opts.schema} attempt=${i}`)
        const retryable = r.status === 429 || r.status === 529 || r.status >= 500
        if (!retryable) return null
      } catch (e) { console.warn(`[llm] callClaude threw (attempt ${i}, schema=${!!opts.schema}): ${String(e)}`) }
      if (i < MAX_ATTEMPTS - 1) await new Promise(res => setTimeout(res, 400 * 2 ** i + Math.floor(Math.random() * 250)))
    }
    console.warn(`[llm] callClaude exhausted → null (caller will stub) schema=${!!opts.schema}`)
    return null
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
              { type: 'text', text: 'Describe in 2-3 sentences what this image shows, in a product/software context (a screenshot, diagram, bug, etc.). Be factual.' },
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
        `Product context:\n${productContext()}\n\n`
        + 'You answer a question about the PRODUCT — its backlog, cycles (Hills), in-flight and shipped work, '
        + 'or a specific feature — using ONLY the provided state snapshot. '
        + 'Be concise and concrete (French), PLAIN TEXT only — no markdown (no **, no #, no markdown bullets). '
        + 'Use the relevant part of the snapshot for the question (a roadmap/backlog question vs a single feature). '
        + 'When asked about changes or history, be SPECIFIC: name the actual signal that was added (quote it briefly), '
        + 'say WHICH fields were refined and HOW they changed, and WHO did it — never just "a mis à jour un signal". '
        + 'If a "Existing code" block is present, it is the GROUND TRUTH of what is actually SHIPPED: use it to answer '
        + '"où en est X / est-ce livré ?" — a feature the roadmap still marks shaped/bet/building may already be merged '
        + 'in the code, so SAY SO and cite the file:line; conversely flag when the code shows no trace. The snapshot is '
        + 'intent/status, the code is reality — reconcile them. '
        + 'If neither answers it, say so. Do not invent.',
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

    clarify: async ({ raw, transcript, code }) => {
      const agentQuestions = transcript.filter(t => t.role === 'agent' && t.text.includes('?')).length
      if (agentQuestions >= MAX_CLARIFY) return null
      const convo = transcript.map(t => `${t.role}: ${t.text}`).join('\n')
      const codeBlock = code ? `\n\n${code}` : ''
      const text = await callClaude(
        `Product context:\n${productContext()}\n\n`
        + 'You are a SENIOR product manager doing Shape Up intake — NOT an order-taker. Do not accept the '
        + 'request at face value and do not flatter; your job is to protect a finite roadmap. '
        + 'Bugs and incidents — even a critical/production one — ARE valid product signals to capture here: this '
        + 'intake is the team\'s entry point for them. Challenge to understand the real problem, but NEVER tell the '
        + 'user it belongs in another tool or process (Jira, ticketing, on-call, incident management); you may flag '
        + 'urgency, but the goal is to shape it into a fix pitch, not to redirect it elsewhere. '
        + 'First reframe the '
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
        + 'later step). Note: a low-priority but real problem is still worth shaping — timing is decided later at betting. '
        + 'CRITICAL — when a "Existing code" block is present, it is the GROUND TRUTH of what is already built: READ '
        + 'it before asking anything. NEVER ask a question whose answer is in that code (how a mechanism works, where '
        + 'some context comes from, whether something exists) — you can already see it. If the signal is ALREADY '
        + 'implemented there, do not interrogate it: reply ONLY "OK" immediately so routing can dedup it (it will flag '
        + 'the duplicate, citing the file). Use the code to skip the obvious and ask only about a genuinely OPEN gap.',
        `Signal: ${raw}\n\nConversation so far:\n${convo}${codeBlock}`, 160, { temperature: 0 },
      )
      if (text === null) return stub.clarify({ raw, transcript })
      const t = text.trim()
      // "Done" signal: an explicit OK (even if the model rambles after it) or a reply with no question.
      // A real clarifying question always ends in "?"; anything else means the model is ready to propose.
      if (!t || /^ok\b/i.test(t) || !t.includes('?')) return null
      return t
    },

    codeTerms: async (signal: string) => {
      const text = await callClaude(
        'Given a product signal, output ONLY a JSON array of 5-12 lowercase keywords/identifiers that would '
        + 'likely appear in THIS product\'s codebase if the thing were already built — function/variable names, '
        + 'domain nouns, provider/integration names, API path fragments. Translate vague phrasing into concrete '
        + 'code terms (e.g. "send candidates to their hiring system" → ["ats","flatchr","applications","push",'
        + '"provider"]). No prose, just the JSON array.',
        `Signal: ${signal}`, 120, { temperature: 0 },
      )
      const arr = parseJson<string[]>(text)
      return Array.isArray(arr) ? arr.filter(t => typeof t === 'string').slice(0, 12) : []
    },

    propose: async (input: ProposeInput) => {
      const { raw, candidates, classification, transcript, existing, roadmap, code } = input
      const candList = candidates.map(c => `- ${c.feature_id} | ${c.title} | sim=${c.similarity.toFixed(2)}`).join('\n') || '(none)'
      const convo = transcript.map(t => `${t.role}: ${t.text}`).join('\n')
      const existingBlock = existing
        ? `\n\nYou are REFINING this existing feature — preserve what still applies and INTEGRATE the new precision (do not drop context):\n`
          + `title: ${existing.title}\nproblem: ${existing.problem}\nsolution: ${existing.solution}\nrabbit_holes: ${existing.rabbit_holes}\nout_of_bounds: ${existing.out_of_bounds}\nappetite: ${existing.appetite}`
        : ''
      const roadmapBlock = roadmap ? `\n\nRoadmap (READ-ONLY context):\n${roadmap}` : ''
      const codeBlock = code ? `\n\n${code}` : ''
      const text = await callClaude(
        `Product context:\n${productContext()}\n\n`
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
        + 'When a "Existing code" block is present, treat it as the GROUND TRUTH of what is already built (more reliable than '
        + 'any ticket): if the signal is already implemented there, prefer append/refine or discard-as-duplicate over creating '
        + 'a new feature, and ground the solution / rabbit_holes / out_of_bounds in the real modules cited (file:line). The code '
        + 'shows what EXISTS, not what is prioritised — never infer priority from it, and stay skeptical (dead code, half-built). '
        + 'Write every text field in FRENCH.',
        `Signal: ${raw}\n\nConversation:\n${convo}\n\nCandidate features:\n${candList}${existingBlock}${roadmapBlock}${codeBlock}`,
        2500, { temperature: 0, schema: PROPOSE_SCHEMA },
      )
      const parsed = parseJson<Partial<Proposal>>(text)
      if (!parsed || (parsed.action !== 'create_feature' && parsed.action !== 'append' && parsed.action !== 'discard')) {
        console.warn(`[llm] propose → stub fallback. text=${text === null ? 'NULL(call failed)' : 'len ' + text.length + ' unparseable: ' + text.slice(0, 160)}`)
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

    triage: async ({ raw }) => {
      const text = await callClaude(
        'You triage a raw input for a Shape Up product backlog. Decide whether it describes ONE shapeable '
        + 'problem or SEVERAL distinct ones. Shape Up: a pitch = one bounded problem with one appetite. '
        + 'LENGTH IS IRRELEVANT — count the distinct, independently-shapeable PRODUCT SIGNALS: feature requests, '
        + 'gaps/limitations raised, bugs, or improvements. '
        + 'A short single ask (even vague) → mode "single", count 1. '
        + 'A MEETING/DEMO TRANSCRIPT almost always raises several distinct signals scattered through the talk '
        + '(a missing filter, a limitation a prospect points out, a "could we also…", a bug) — count EACH of those, '
        + 'even though most of the transcript is narration/demo/small-talk you ignore → mode "multi". '
        + 'Only the SAME problem\'s sub-details do not add to the count. When the input is a transcript/long doc, '
        + 'lean toward "multi". Write reason in FRENCH.',
        `Input:\n${raw.slice(0, 60000)}`,
        300, { temperature: 0, schema: TRIAGE_SCHEMA },
      )
      const parsed = parseJson<Partial<Triage>>(text)
      if (!parsed || (parsed.mode !== 'single' && parsed.mode !== 'multi')) return stub.triage({ raw })
      const count = typeof parsed.count === 'number' ? Math.max(1, Math.round(parsed.count)) : 2
      return { mode: parsed.mode, count: parsed.mode === 'multi' ? Math.max(2, count) : 1, reason: parsed.reason || '' }
    },

    decompose: async ({ raw, roadmap }) => {
      const roadmapBlock = roadmap ? `\n\nRoadmap (READ-ONLY context):\n${roadmap}` : ''
      const text = await callClaude(
        `Product context:\n${productContext()}\n\n`
        + 'You are a senior PM doing Shape Up intake. The input is often a meeting/demo transcript where most of the '
        + 'text is narration, sales pitch and small talk — but participants raise SEVERAL distinct product signals: '
        + 'a feature request, a limitation/gap someone points out, a "could we also…", a bug, an improvement. '
        + 'Extract EACH distinct, independently-shapeable signal. For each: a short title and a SELF-CONTAINED problem '
        + 'statement (RECONTEXTUALIZE — the reader has NOT seen the transcript and does not know the product jargon), '
        + 'plus a classification (musing | explore | directive). '
        + 'IGNORE narration, demo walkthrough, sales pitch and chatter. MERGE duplicates (one entry per real signal). '
        + 'Do NOT invent problems that are not genuinely raised. '
        + 'For EACH signal, set clarifying_question: if the transcript leaves a signal too UNDER-SPECIFIED to shape '
        + 'well (the core problem is ambiguous, it reads as a solution without the underlying need, the scope/appetite '
        + 'is unclear, or it might overlap an existing feature), write ONE targeted question (FR) to ask the human. '
        + 'If the signal is already clear enough to shape, set clarifying_question to null. Be SELECTIVE — most '
        + 'well-stated signals need null; only flag the genuinely ambiguous ones. Write every field in FRENCH.'
        + roadmapBlock,
        `Source:\n${raw.slice(0, 120000)}`,
        2600, { temperature: 0, schema: DECOMPOSE_SCHEMA },
      )
      const parsed = parseJson<{ signals?: DecomposedSignal[] }>(text)
      const signals = parsed?.signals?.filter(s => s && s.problem?.trim())
      if (!signals?.length) return stub.decompose({ raw, roadmap })
      return signals.map(s => ({
        title: (s.title || s.problem).trim().slice(0, 80),
        problem: s.problem.trim(),
        classification: (['musing', 'explore', 'directive'].includes(s.classification as string) ? s.classification : 'explore') as Classification,
        clarifying_question: (typeof s.clarifying_question === 'string' && s.clarifying_question.trim()) ? s.clarifying_question.trim() : null,
      }))
    },
  }
}
