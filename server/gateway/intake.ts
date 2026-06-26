import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { all, get, run, tx } from '../db/client'
import { getAttachment, linkAttachments, uploadsDir } from '../db/attachments'
import { logEvent } from '../db/events'
import { ensureSchema } from '../db/schema'
import type {
  Candidate, Feature, IntakeSessionData, IntakeState, Proposal, TurnResponse,
} from '../domain/types'
import { getLlm } from '../llm/provider'
import type { AttachmentForLlm, LlmProvider } from '../llm/provider'
import { cosine, decodeEmbedding, encodeEmbedding, localEmbed } from '../utils/embedding'
import { newId } from '../utils/id'

const MAX_TURNS = 18         // bounded loop — the agent decides how many shaping turns it needs;
                            // this is only a safety ceiling that forces a proposal so it always converges
// Below this confidence (signal mode), the agent asks the human to arbitrate instead of proposing.
// A safety net: a well-calibrated model rarely dips here once shaped. Tunable via env for testing.
const CONFIDENCE_THRESHOLD = Number(process.env.NUXT_CONFIDENCE_THRESHOLD ?? 0.45)
const CANDIDATE_FLOOR = 0.15 // ignore near-zero similarities in the candidate list
const TOP_K = 5

// ── Dedup search (brute-force cosine — brief §6) ─────────────────────────────
export function topCandidates(embedding: number[], k = TOP_K): Candidate[] {
  const rows = all<Pick<Feature, 'id' | 'title' | 'embedding'>>(
    `SELECT id, title, embedding FROM features WHERE status IN ('shaped','bet','building')`,
  )
  return rows
    .map(r => ({ feature_id: r.id, title: r.title, similarity: cosine(embedding, decodeEmbedding(r.embedding)) }))
    .filter(c => c.similarity >= CANDIDATE_FLOOR)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, k)
}

// ── Feature search (resolve a named feature; answer queries) ─────────────────
interface FeatureHit { id: string; title: string; status: string; score: number }
export function searchFeatures(text: string, k = 3): FeatureHit[] {
  const q = localEmbed(text)
  const ql = text.toLowerCase()
  const words = ql.split(/[^a-z0-9àâäéèêëïîôöùûüç]+/).filter(w => w.length > 2)
  const rows = all<Pick<Feature, 'id' | 'title' | 'status' | 'embedding'>>('SELECT id, title, status, embedding FROM features')
  return rows
    .map((r) => {
      const tl = r.title.toLowerCase()
      const titleBoost = tl.includes(ql) ? 1 : words.filter(w => tl.includes(w)).length * 0.25
      return { id: r.id, title: r.title, status: r.status, score: cosine(q, decodeEmbedding(r.embedding)) + titleBoost }
    })
    .filter(h => h.score > 0.15)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
}

/** Human-readable current state of a feature, for read-only query answers. */
export function featureContext(id: string): string {
  const f = get<Feature & { hill_name: string | null }>(
    `SELECT f.*, h.name AS hill_name FROM features f LEFT JOIN hills h ON h.id = f.hill_id WHERE f.id = ?`, id,
  )
  if (!f) return 'Feature introuvable.'
  const lastDecision = get<{ verdict: string, rationale: string, decided_by: string | null }>(
    'SELECT verdict, rationale, decided_by FROM decisions WHERE feature_id = ? ORDER BY decided_at DESC LIMIT 1', id,
  )
  const prs = all<{ repo: string, pr_number: number, status: string }>('SELECT repo, pr_number, status FROM pr_links WHERE feature_id = ?', id)
  const recentRows = all<{ actor: string, summary: string, detail: string | null, created_at: string }>('SELECT actor, summary, detail, created_at FROM feature_events WHERE feature_id = ? ORDER BY seq DESC LIMIT 6', id)
  const recent = recentRows.map((e) => {
    const lines = [`  • ${e.summary}`]
    if (e.detail) {
      try {
        const d = JSON.parse(e.detail) as { content?: string, rationale?: string, changes?: { label: string, before: string, after: string }[] }
        if (d.content) lines.push(`      signal ajouté : « ${d.content.slice(0, 220)} »`)
        if (d.rationale) lines.push(`      rationale : « ${d.rationale.slice(0, 220)} »`)
        if (d.changes?.length) {
          for (const c of d.changes) lines.push(`      ${c.label} affiné : « ${(c.before || '∅').slice(0, 120)} » → « ${(c.after || '').slice(0, 160)} »`)
        }
      } catch { /* ignore */ }
    }
    return lines.join('\n')
  })
  return [
    `Feature : ${f.title}`,
    `Statut : ${f.status}${f.stale ? ' (stale)' : ''}`,
    `Appétit : ${f.appetite ?? '—'} · Signaux : ${f.signal_count}`,
    f.hill_name ? `Hill : ${f.hill_name}` : 'Hill : non pariée',
    `Problème : ${f.problem}`,
    f.solution ? `Solution : ${f.solution}` : '',
    lastDecision ? `Dernière décision : ${lastDecision.verdict} — ${lastDecision.rationale} (${lastDecision.decided_by ?? '—'})` : '',
    prs.length ? `PR : ${prs.map(p => `${p.repo}#${p.pr_number} (${p.status})`).join(', ')}` : '',
    recent.length ? `Activité récente (du plus récent au plus ancien) :\n${recent.join('\n')}` : '',
  ].filter(Boolean).join('\n')
}

// ── Session persistence ──────────────────────────────────────────────────────
interface SessionRow { id: string; state: string; turns: number; data: string; committed: number }

function loadSession(id: string): { row: SessionRow; data: IntakeSessionData } | null {
  const row = get<SessionRow>('SELECT id, state, turns, data, committed FROM intake_session WHERE id = ?', id)
  if (!row) return null
  return { row, data: JSON.parse(row.data) as IntakeSessionData }
}

function saveSession(id: string, state: string, turns: number, data: IntakeSessionData, committed = 0) {
  run(
    'UPDATE intake_session SET state = ?, turns = ?, data = ?, committed = ?, updated_at = ? WHERE id = ?',
    state, turns, JSON.stringify(data), committed, new Date().toISOString(), id,
  )
}

// ── A single intake turn (the conversational loop) ───────────────────────────
/** Read uploaded files and turn them into French context text (vision for images, inline for text). */
async function extractAttachmentContext(ids: string[], llm: LlmProvider): Promise<string> {
  if (!ids.length || !llm.extractAttachments) return ''
  const items: AttachmentForLlm[] = []
  for (const id of ids) {
    const a = getAttachment(id)
    if (!a) continue
    try {
      const buf = readFileSync(join(uploadsDir(), a.storage_path))
      if (a.kind === 'image') items.push({ kind: 'image', mime: a.mime, filename: a.filename, base64: buf.toString('base64') })
      else if (a.kind === 'text') items.push({ kind: 'text', mime: a.mime, filename: a.filename, text: buf.toString('utf8') })
    } catch { /* skip unreadable */ }
  }
  return items.length ? llm.extractAttachments(items) : ''
}

export async function intakeTurn(sessionId: string | null, message: string, source = 'manual', capturedBy: string | null = null, attachmentIds: string[] = []): Promise<TurnResponse> {
  ensureSchema()
  const llm = await getLlm()
  let text = message.trim()

  // First turn — detect intent (query / refine / signal) and open a session.
  if (!sessionId) {
    // Fold attached files into the raw signal as context before routing/shaping.
    if (attachmentIds.length) {
      const extracted = await extractAttachmentContext(attachmentIds, llm)
      if (extracted) text = `${text}\n\n[Contexte des pièces jointes]\n${extracted}`
    }
    const id = newId()
    const intent = await llm.detectIntent(text)
    const data: IntakeSessionData = {
      raw: text, source, captured_by: capturedBy,
      mode: intent.intent, target_feature_id: null, merge_from_id: null,
      initial_action: null, initial_target: null,
      transcript: [{ role: 'user', text }], proposal: null, candidates: [],
      attachment_ids: attachmentIds,
    }

    // Read-only question → answer from current state, no write.
    if (intent.intent === 'query') {
      const hit = searchFeatures(intent.target || text, 1)[0]
      data.target_feature_id = hit?.id ?? null
      const answer = hit
        ? await llm.answerQuery(text, featureContext(hit.id))
        : 'Je n\'ai trouvé aucune feature correspondante dans le backlog.'
      data.transcript.push({ role: 'agent', text: answer })
      run(
        'INSERT INTO intake_session (id, state, turns, data, committed, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)',
        id, 'answered', 1, JSON.stringify(data), new Date().toISOString(), new Date().toISOString(),
      )
      return { session_id: id, state: 'answered', agent_message: answer, proposal: null }
    }

    // Refine a named feature → pin it as the target (fall back to a normal signal if unresolved).
    if (intent.intent === 'refine') {
      const hit = searchFeatures(intent.target || text, 1)[0]
      if (hit) data.target_feature_id = hit.id
      else data.mode = 'signal'
    }

    // Merge two named features → resolve survivor (target2) + absorbed (target).
    if (intent.intent === 'merge') {
      const survivor = intent.target2 ? searchFeatures(intent.target2, 1)[0] : null
      const absorbed = intent.target ? searchFeatures(intent.target, 1)[0] : null
      if (survivor && absorbed && survivor.id !== absorbed.id) {
        data.target_feature_id = survivor.id
        data.merge_from_id = absorbed.id
      } else if (absorbed || survivor) {
        // Only one resolved → treat as a refine of it.
        data.mode = 'refine'
        data.target_feature_id = (absorbed || survivor)!.id
      } else {
        data.mode = 'signal'
      }
    }

    run(
      'INSERT INTO intake_session (id, state, turns, data, committed, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)',
      id, 'gather', 1, JSON.stringify(data), new Date().toISOString(), new Date().toISOString(),
    )
    return advance(id, 'gather', 1, data, llm)
  }

  const loaded = loadSession(sessionId)
  if (!loaded) throw createError({ statusCode: 404, statusMessage: 'Unknown intake session' })
  if (loaded.row.committed) throw createError({ statusCode: 409, statusMessage: 'Session already committed' })

  const data = loaded.data
  data.transcript.push({ role: 'user', text })
  const turns = loaded.row.turns + 1

  // In query mode, re-detect intent so the user can naturally switch to a write
  // (e.g. ask a question, then "ok crée un ticket pour X" / "affine la feature Y").
  if (data.mode === 'query') {
    const intent = await llm.detectIntent(text)
    if (intent.intent === 'query') {
      // Keep the feature in focus for pronoun references ("ce ticket", "dessus");
      // only switch when the message explicitly names another feature (intent.target set).
      let fid = data.target_feature_id
      if (intent.target) {
        const hit = searchFeatures(intent.target, 1)[0]
        if (hit) fid = hit.id
      }
      if (fid) data.target_feature_id = fid
      const answer = fid ? await llm.answerQuery(text, featureContext(fid)) : 'Aucune feature correspondante.'
      data.transcript.push({ role: 'agent', text: answer })
      saveSession(sessionId, 'answered', turns, data)
      return { session_id: sessionId, state: 'answered', agent_message: answer, proposal: null }
    }
    // Switched to a write intent — re-base the session on this message.
    data.mode = intent.intent
    data.raw = text
    if (intent.intent === 'refine') {
      const hit = searchFeatures(intent.target || text, 1)[0]
      if (hit) data.target_feature_id = hit.id
      else data.mode = 'signal'
    } else if (intent.intent === 'merge') {
      const survivor = intent.target2 ? searchFeatures(intent.target2, 1)[0] : null
      const absorbed = intent.target ? searchFeatures(intent.target, 1)[0] : null
      if (survivor && absorbed && survivor.id !== absorbed.id) {
        data.target_feature_id = survivor.id
        data.merge_from_id = absorbed.id
      } else { data.mode = 'signal' }
    }
  }

  return advance(sessionId, loaded.row.state, turns, data, llm)
}

// State machine: clarify (bounded) → propose. Writing happens only at commit.
async function advance(
  id: string, _prevState: string, turns: number, data: IntakeSessionData,
  llm: Awaited<ReturnType<typeof getLlm>>,
): Promise<TurnResponse> {
  const llmEmbed = await llm.embed(data.raw)
  const candidates = topCandidates(llmEmbed)
  data.candidates = candidates

  // A merge is an explicit human directive (the survivor/absorbed are already resolved) — skip the
  // adaptive shaping loop and go straight to the consolidated-pitch proposal for confirmation.
  const skipClarify = data.mode === 'merge'

  // Ask at most until the cap; once capped, force a proposal.
  if (!skipClarify && turns < MAX_TURNS) {
    const question = await llm.clarify({ raw: data.raw, transcript: data.transcript })
    if (question) {
      data.transcript.push({ role: 'agent', text: question })
      saveSession(id, 'clarify', turns, data)
      return { session_id: id, state: 'clarify', agent_message: question, proposal: null }
    }
  }

  // Propose (reflect + route).
  const classification = await llm.classify(data.raw)
  let proposal: Proposal
  let reflect: string

  if (data.mode === 'merge' && data.target_feature_id && data.merge_from_id) {
    // Deliberate merge of two named features → consolidated pitch on the survivor.
    const survivor = get<Feature>('SELECT * FROM features WHERE id = ?', data.target_feature_id)
    const absorbed = get<Feature>('SELECT * FROM features WHERE id = ?', data.merge_from_id)
    const mergeRaw = `Fusion de deux features. À ABSORBER : « ${absorbed?.title} » — problème: ${absorbed?.problem} ; solution: ${absorbed?.solution} ; rabbit holes: ${absorbed?.rabbit_holes} ; no-gos: ${absorbed?.out_of_bounds}. Produis un pitch CONSOLIDÉ qui couvre les deux features.`
    proposal = await llm.propose({
      raw: mergeRaw, transcript: data.transcript, classification,
      candidates: survivor ? [{ feature_id: survivor.id, title: survivor.title, similarity: 1 }] : candidates,
      existing: survivor
        ? { title: survivor.title, problem: survivor.problem, solution: survivor.solution || '', rabbit_holes: survivor.rabbit_holes || '', out_of_bounds: survivor.out_of_bounds || '', appetite: survivor.appetite || 'small' }
        : undefined,
    })
    proposal.action = 'merge'
    proposal.target_feature_id = data.target_feature_id
    proposal.merge_from_feature_id = data.merge_from_id
    proposal.confidence = 1
    reflect = `Je propose de fusionner « ${absorbed?.title} » dans « ${survivor?.title} » et de consolider le pitch — signaux, décisions et historique rapatriés, l'absorbée archivée. Tu confirmes, ou tu corriges ?`
  } else if (data.mode === 'refine' && data.target_feature_id) {
    // Explicit target: force append to it, and feed Claude the current pitch to merge into.
    const target = get<Feature>('SELECT * FROM features WHERE id = ?', data.target_feature_id)
    proposal = await llm.propose({
      raw: data.raw, transcript: data.transcript, classification,
      candidates: target ? [{ feature_id: target.id, title: target.title, similarity: 1 }] : candidates,
      existing: target
        ? { title: target.title, problem: target.problem, solution: target.solution || '', rabbit_holes: target.rabbit_holes || '', out_of_bounds: target.out_of_bounds || '', appetite: target.appetite || 'small' }
        : undefined,
    })
    if (target && (target.status === 'done' || target.status === 'archived')) {
      // Don't reopen a shipped/archived solution — shape a NEW iteration linked to it.
      proposal.action = 'create_feature'
      proposal.target_feature_id = null
      proposal.supersedes_id = target.id
      reflect = `« ${target.title} » est déjà ${target.status === 'done' ? 'livrée' : 'archivée'} — pas de réouverture. Je propose une NOUVELLE itération « ${proposal.proposed_spec.title} » liée à la version précédente. Tu confirmes, ou tu corriges ?`
    } else {
      proposal.action = 'append'
      proposal.target_feature_id = data.target_feature_id
      reflect = `J'ai compris : « ${proposal.proposed_spec.problem} ». Je propose d'affiner la feature « ${proposal.proposed_spec.title} » (${proposal.confidence * 100 | 0}% de confiance). Tu confirmes, ou tu corriges ?`
    }
  } else {
    proposal = await llm.propose({ raw: data.raw, transcript: data.transcript, candidates, classification })
    if (proposal.action === 'append') {
      reflect = `J'ai compris : « ${proposal.proposed_spec.problem} ». Je propose de le rattacher à la feature « ${proposal.proposed_spec.title} » (${proposal.confidence * 100 | 0}% de confiance). Tu confirmes, ou tu corriges ?`
    } else if (proposal.action === 'discard') {
      reflect = `Ce signal n'apporte rien de nouveau (doublon / hors-scope) — je propose de l'écarter. ${proposal.rationale} Tu confirmes, ou tu corriges ?`
    } else {
      reflect = `J'ai compris : « ${proposal.proposed_spec.problem} ». Aucun doublon fort — je propose de créer une nouvelle feature « ${proposal.proposed_spec.title} » (appétit ${proposal.proposed_spec.appetite}). Tu confirmes, ou tu corriges ?`
    }
  }

  // Capture the agent's FIRST proposal — corrected metric compares it to what's committed.
  if (data.initial_action === null) {
    data.initial_action = proposal.action
    data.initial_target = proposal.target_feature_id ?? null
  }
  data.proposal = proposal

  // Low confidence (signal mode only — refine/merge are explicit) → human must arbitrate.
  const lowConf = data.mode === 'signal' && proposal.confidence < CONFIDENCE_THRESHOLD
  if (lowConf) {
    const cands = proposal.candidates.map((c, i) => `${i + 1}. « ${c.title} » (${c.similarity * 100 | 0}%)`).join(' · ')
    reflect = `⚠ Confiance faible (${proposal.confidence * 100 | 0}%). À toi de trancher : créer une nouvelle feature, ou rattacher à un candidat${cands ? ` — ${cands}` : ''} ?\n\n${reflect}`
  }
  data.transcript.push({ role: 'agent', text: reflect })

  const state: IntakeState = lowConf ? 'pending_review' : 'propose'
  saveSession(id, state, turns, data)
  return { session_id: id, state, agent_message: reflect, proposal }
}

// ── Commit — the ONLY write path into the domain tables ──────────────────────
export interface CommitResult {
  feedback_id: string
  feature_id: string | null   // null for `discard`
  action: Proposal['action']
  idempotent: boolean
}

export async function intakeCommit(sessionId: string, committedBy: string | null = null): Promise<CommitResult> {
  ensureSchema()
  const loaded = loadSession(sessionId)
  if (!loaded) throw createError({ statusCode: 404, statusMessage: 'Unknown intake session' })
  if (loaded.row.committed) throw createError({ statusCode: 409, statusMessage: 'Session already committed' })
  const { data } = loaded
  // Attribution reflects who actually commits (their authenticated session), not who opened it.
  if (committedBy) data.captured_by = committedBy
  const proposal = data.proposal
  if (!proposal) throw createError({ statusCode: 400, statusMessage: 'No proposal to commit — run /api/intake/turn first' })

  const llm = await getLlm()
  const contentHash = createHash('sha256').update(data.raw.trim().toLowerCase()).digest('hex')

  // Idempotence: same brut already routed → no-op.
  const existing = get<{ id: string, feature_id: string | null }>('SELECT id, feature_id FROM feedback WHERE content_hash = ?', contentHash)
  if (existing?.feature_id) {
    saveSession(sessionId, 'committed', loaded.row.turns, data, 1)
    return { feedback_id: existing.id, feature_id: existing.feature_id, action: proposal.action, idempotent: true }
  }

  const now = new Date().toISOString()
  const fbEmbedding = await llm.embed(data.raw)
  const feedbackId = newId()

  const FIELD_LABEL: Record<string, string> = {
    problem: 'Problème', solution: 'Solution', rabbit_holes: 'Rabbit holes',
    out_of_bounds: 'No-gos', appetite: 'Appétit',
  }

  const result = tx<{ feature_id: string | null }>(() => {
    let featureId: string | null
    let feedbackStatus = 'routed'

    if (proposal.action === 'discard') {
      // Noise / out-of-scope / semantic dup → record the feedback as archived, no feature mutation.
      featureId = proposal.target_feature_id ?? null
      feedbackStatus = 'archived'
      if (featureId) {
        logEvent(featureId, data.captured_by, 'discarded', `Signal écarté par ${data.captured_by || 'inconnu'} (doublon / hors-scope)`, { content: data.raw })
      }
    } else if (proposal.action === 'merge' && proposal.target_feature_id && proposal.merge_from_feature_id) {
      // Deliberate, human-confirmed merge: re-parent everything onto the survivor, archive the absorbed.
      const survivorId = proposal.target_feature_id
      const absorbedId = proposal.merge_from_feature_id
      const survivor = get<Feature>('SELECT * FROM features WHERE id = ?', survivorId)
      const absorbed = get<Feature>('SELECT * FROM features WHERE id = ?', absorbedId)
      if (!survivor || !absorbed) throw createError({ statusCode: 409, statusMessage: 'Merge target no longer exists' })
      const actor = data.captured_by
      const spec = proposal.proposed_spec
      const next = { problem: survivor.problem, solution: survivor.solution, rabbit_holes: survivor.rabbit_holes, out_of_bounds: survivor.out_of_bounds, appetite: survivor.appetite }
      const changes: { field: string; label: string; before: string; after: string }[] = []
      if (llm.name !== 'stub') {
        for (const k of Object.keys(FIELD_LABEL) as (keyof typeof next)[]) {
          const after = (spec[k as keyof typeof spec] as string | undefined)?.trim()
          const before = (next[k] || '') as string
          if (after && after !== before.trim()) { next[k] = after as never; changes.push({ field: k, label: FIELD_LABEL[k], before, after }) }
        }
      }
      run('UPDATE feedback SET feature_id = ? WHERE feature_id = ?', survivorId, absorbedId)
      run('UPDATE decisions SET feature_id = ? WHERE feature_id = ?', survivorId, absorbedId)
      run('UPDATE pr_links SET feature_id = ? WHERE feature_id = ?', survivorId, absorbedId)
      run('UPDATE feature_events SET feature_id = ? WHERE feature_id = ?', survivorId, absorbedId)
      const priorContents = all<{ content: string }>('SELECT content FROM feedback WHERE feature_id = ?', survivorId).map(r => r.content)
      const merged = [survivor.title, next.problem, next.solution, ...priorContents].join(' \n ')
      run(
        `UPDATE features SET problem = ?, solution = ?, rabbit_holes = ?, out_of_bounds = ?, appetite = ?,
                signal_count = ?, stale = 0, embedding = ?, updated_at = ? WHERE id = ?`,
        next.problem, next.solution, next.rabbit_holes, next.out_of_bounds, next.appetite,
        survivor.signal_count + absorbed.signal_count, encodeEmbedding(localEmbed(merged)), now, survivorId,
      )
      run('UPDATE features SET status = ?, updated_at = ? WHERE id = ?', 'archived', now, absorbedId)
      logEvent(survivorId, actor, 'merged', `Feature « ${absorbed.title} » fusionnée dans « ${survivor.title} » par ${actor || 'inconnu'}`, { from: absorbed.title, changes })
      logEvent(absorbedId, actor, 'merged', `Fusionnée dans « ${survivor.title} » par ${actor || 'inconnu'} — archivée`, { into: survivor.title })
      featureId = survivorId
      feedbackStatus = 'archived' // the merge instruction is not a product signal
    } else if (proposal.action === 'append' && proposal.target_feature_id) {
      featureId = proposal.target_feature_id
      const feat = get<Feature>('SELECT * FROM features WHERE id = ?', featureId)
      if (!feat) throw createError({ statusCode: 409, statusMessage: 'Target feature no longer exists' })
      const actor = data.captured_by
      const spec = proposal.proposed_spec

      // Append doesn't just add a signal — it can REFINE the pitch. Apply each field the
      // (human-confirmed) proposal reworded, keep non-empty values, and log a field_updated
      // event with before/after so the change is attributed in the timeline.
      const next = {
        problem: feat.problem,
        solution: feat.solution,
        rabbit_holes: feat.rabbit_holes,
        out_of_bounds: feat.out_of_bounds,
        appetite: feat.appetite,
      }
      // Only a real LLM produces a genuine consolidated pitch; the offline stub echoes the
      // raw signal as 'problem', which must NOT overwrite an existing pitch.
      const changes: { field: string; label: string; before: string; after: string }[] = []
      // Guard: never replace a shaped field with the user's raw instruction (model echo).
      const rawNorm = data.raw.trim().toLowerCase()
      const isEcho = (s: string) => {
        const a = s.trim().toLowerCase()
        return a === rawNorm || (a.length >= 20 && (rawNorm.includes(a.slice(0, 40)) || a.includes(rawNorm.slice(0, 40))))
      }
      if (llm.name !== 'stub') {
        for (const k of Object.keys(FIELD_LABEL) as (keyof typeof next)[]) {
          const after = (spec[k as keyof typeof spec] as string | undefined)?.trim()
          const before = (next[k] || '') as string
          if (after && after !== before.trim() && !isEcho(after)) {
            next[k] = after as never
            changes.push({ field: k, label: FIELD_LABEL[k], before, after })
          }
        }
      }

      // Re-embed from the (possibly refined) shape + accumulated signals.
      const priorContents = all<{ content: string }>('SELECT content FROM feedback WHERE feature_id = ?', featureId).map(r => r.content)
      const merged = [feat.title, next.problem, next.solution, ...priorContents, data.raw].join(' \n ')
      run(
        `UPDATE features SET problem = ?, solution = ?, rabbit_holes = ?, out_of_bounds = ?, appetite = ?,
                signal_count = signal_count + 1, stale = 0, embedding = ?, updated_at = ? WHERE id = ?`,
        next.problem, next.solution, next.rabbit_holes, next.out_of_bounds, next.appetite,
        encodeEmbedding(localEmbed(merged)), now, featureId,
      )
      // ONE grouped "revision" event per append (digest), with the refinements nested in detail.
      const who = actor || 'inconnu'
      const summary = changes.length
        ? `${who} a rattaché un signal et affiné le pitch (${changes.map(c => c.label.toLowerCase()).join(', ')})`
        : `Signal rattaché par ${who}`
      logEvent(featureId, actor, 'signal_added', summary, { content: data.raw, changes })
    } else {
      // create_feature
      featureId = newId()
      const spec = proposal.proposed_spec
      const supersedes = proposal.supersedes_id ?? null
      run(
        `INSERT INTO features (id, title, problem, appetite, solution, rabbit_holes, out_of_bounds, status, stale, signal_count, supersedes_id, embedding, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'shaped', 0, 1, ?, ?, ?, ?)`,
        featureId, spec.title, spec.problem, spec.appetite, spec.solution || null, spec.rabbit_holes || null, spec.out_of_bounds || null,
        supersedes, encodeEmbedding(localEmbed([spec.title, spec.problem, spec.solution].join(' \n '))), now, now,
      )
      const createdSummary = supersedes
        ? `Nouvelle itération créée par ${data.captured_by || 'inconnu'} (remplace une version livrée)`
        : `Feature créée par ${data.captured_by || 'inconnu'}`
      logEvent(featureId, data.captured_by, 'created', createdSummary, { title: spec.title, supersedes })
    }

    run(
      `INSERT INTO feedback (id, content, source, captured_by, classification, status, feature_id, content_hash, embedding, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      feedbackId, data.raw, data.source, data.captured_by, proposal.classification, feedbackStatus, featureId, contentHash,
      encodeEmbedding(fbEmbedding), now,
    )

    // Link any files uploaded with this signal to the resulting feature + feedback.
    linkAttachments(data.attachment_ids || [], featureId, feedbackId)

    // Quality metric: did the human change the agent's FIRST proposal?
    const corrected = (data.initial_action !== null
      && (data.initial_action !== proposal.action || (data.initial_target ?? null) !== (proposal.target_feature_id ?? null))) ? 1 : 0

    run(
      `INSERT INTO routing_log (id, feedback_id, action, target_feature_id, confidence, rationale, model, corrected, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      newId(), feedbackId, proposal.action, featureId, proposal.confidence, proposal.rationale, llm.name, corrected, now,
    )

    return { feature_id: featureId }
  })

  saveSession(sessionId, 'committed', loaded.row.turns, data, 1)
  return { feedback_id: feedbackId, feature_id: result.feature_id, action: proposal.action, idempotent: false }
}
