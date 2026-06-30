import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { all, get, run, tx } from '../db/client'
import { getAttachment, linkAttachments, uploadsDir } from '../db/attachments'
import { logEvent } from '../db/events'
import { ensureSchema } from '../db/schema'
import type {
  BatchSegment, Candidate, Feature, IntakeSessionData, IntakeState, Proposal, TurnResponse,
} from '../domain/types'
import { getLlm } from '../llm/provider'
import type { AttachmentForLlm, LlmProvider } from '../llm/provider'
import { grepPath } from '../utils/codeRepo'
import { codeContextFor } from '../utils/codeSearch'
import { cosine, decodeEmbedding, encodeEmbedding, localEmbed } from '../utils/embedding'
import { newId } from '../utils/id'

/** The local dir to grep for this workspace — a local path, or the server-side clone of the linked
 *  GitHub repo (see server/utils/codeRepo). Empty → no code grounding. */
export function codeRepo(): string | undefined {
  return grepPath()
}

const MAX_TURNS = 18         // bounded loop — the agent decides how many shaping turns it needs;
                            // this is only a safety ceiling that forces a proposal so it always converges
// Below this confidence (signal mode), the agent asks the human to arbitrate instead of proposing.
// A safety net: a well-calibrated model rarely dips here once shaped. Tunable via env for testing.
const CONFIDENCE_THRESHOLD = Number(process.env.NUXT_CONFIDENCE_THRESHOLD ?? 0.45)
const CANDIDATE_FLOOR = 0.15 // ignore near-zero similarities in the candidate list
// How many dedup candidates we surface to the LLM judge. Local (non-semantic) embeddings rank the
// true twin imperfectly, so we hand the judge a wider slate — it's the real same/not-same decider.
const TOP_K = 8

// ── Dedup search (brute-force cosine — brief §6) ─────────────────────────────
// Append targets are SHAPED only: a feature already bet/building lives in a validated cycle and its
// scope is frozen (Shape Up — no mid-cycle scope creep). In-flight features are surfaced separately
// as read-only roadmap context so the agent stays aware without amending them.
export function topCandidates(embedding: number[], k = TOP_K): Candidate[] {
  const rows = all<Pick<Feature, 'id' | 'title' | 'embedding'>>(
    `SELECT id, title, embedding FROM features WHERE status = 'shaped'`,
  )
  return rows
    .map(r => ({ feature_id: r.id, title: r.title, similarity: cosine(embedding, decodeEmbedding(r.embedding)) }))
    .filter(c => c.similarity >= CANDIDATE_FLOOR)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, k)
}

// Read-only picture of what's already committed — injected into the routing prompt so the agent
// decides like a PM who knows the roadmap (and never proposes amending a frozen, in-cycle scope).
export function roadmapContext(): string {
  const hills = all<{ name: string; status: string }>(
    `SELECT name, status FROM hills WHERE status IN ('active','planned') ORDER BY starts_at`,
  )
  const inFlight = all<{ title: string; status: string }>(
    `SELECT title, status FROM features WHERE status IN ('bet','building') ORDER BY updated_at DESC LIMIT 12`,
  )
  const lines: string[] = []
  if (hills.length) lines.push(`Cycles actifs / planifiés : ${hills.map(h => `${h.name} (${h.status})`).join(' · ')}`)
  if (inFlight.length) {
    lines.push(
      'Features DÉJÀ ENGAGÉES dans un cycle (périmètre figé — NE PAS amender ; un signal qui les '
      + 'concerne = une NOUVELLE feature pour un prochain cycle, ou un discard si rien de neuf) :\n'
      + inFlight.map(f => `- ${f.title} (${f.status})`).join('\n'),
    )
  }
  return lines.join('\n\n')
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

/** Compact, read-only snapshot of the whole product — backlog, cycles, in-flight work, shipped,
 *  recent activity — so a `query` can answer roadmap/backlog questions, not just single-feature ones. */
export function workspaceContext(focus: string): string {
  const counts = get<{ shaped: number; bet: number; building: number; done: number }>(
    `SELECT SUM(status='shaped') AS shaped, SUM(status='bet') AS bet, SUM(status='building') AS building, SUM(status='done') AS done
     FROM features WHERE status NOT IN ('archived','deleted')`,
  )
  const shaped = all<{ title: string; signal_count: number; stale: number }>(
    `SELECT title, signal_count, stale FROM features WHERE status='shaped' ORDER BY stale ASC, signal_count DESC, updated_at DESC LIMIT 15`,
  )
  const inFlight = all<{ title: string; status: string; hill: string | null }>(
    `SELECT f.title, f.status, h.name AS hill FROM features f LEFT JOIN hills h ON h.id=f.hill_id WHERE f.status IN ('bet','building') ORDER BY f.updated_at DESC LIMIT 15`,
  )
  const shipped = all<{ title: string }>(`SELECT title FROM features WHERE status='done' ORDER BY updated_at DESC LIMIT 10`)
  const hills = all<{ name: string; status: string; starts_at: string | null; ends_at: string | null; total: number; done: number }>(
    `SELECT h.name, h.status, h.starts_at, h.ends_at, COUNT(f.id) AS total,
            COALESCE(SUM(CASE WHEN f.status='done' THEN 1 ELSE 0 END),0) AS done
     FROM hills h LEFT JOIN features f ON f.hill_id=h.id AND f.status IN ('bet','building','done')
     GROUP BY h.id ORDER BY h.starts_at DESC LIMIT 8`,
  )
  const tables = all<{ title: string; status: string }>(`SELECT title, status FROM betting_tables WHERE status != 'deleted' ORDER BY created_at DESC LIMIT 8`)
  const activity = all<{ summary: string; title: string }>(
    `SELECT e.summary, f.title FROM feature_events e JOIN features f ON f.id=e.feature_id ORDER BY e.seq DESC LIMIT 8`,
  )
  const hit = searchFeatures(focus, 1)[0]

  const lines: string[] = []
  lines.push(`Backlog : ${counts?.shaped ?? 0} shaped · ${counts?.bet ?? 0} bet · ${counts?.building ?? 0} building · ${counts?.done ?? 0} done.`)
  if (shaped.length) lines.push(`Shaped (prêtes à parier) :\n${shaped.map(f => `  • ${f.title} — ${f.signal_count} signal(aux)${f.stale ? ' [stale]' : ''}`).join('\n')}`)
  if (inFlight.length) lines.push(`En cours (cycle) :\n${inFlight.map(f => `  • ${f.title} (${f.status}${f.hill ? `, ${f.hill}` : ''})`).join('\n')}`)
  if (shipped.length) lines.push(`Livrées récemment :\n${shipped.map(f => `  • ${f.title}`).join('\n')}`)
  if (hills.length) lines.push(`Hills (cycles) :\n${hills.map(h => `  • ${h.name} — ${h.status}, ${h.total ? Math.round(h.done / h.total * 100) : 0}% (${h.done}/${h.total})${h.starts_at ? `, ${h.starts_at}→${h.ends_at ?? '—'}` : ''}`).join('\n')}`)
  if (tables.length) lines.push(`Betting tables : ${tables.map(t => `${t.title} (${t.status})`).join(' · ')}`)
  if (activity.length) lines.push(`Activité récente :\n${activity.map(a => `  • ${a.summary} — « ${a.title} »`).join('\n')}`)
  if (hit) lines.push(`\nFeature en focus « ${hit.title} » :\n${featureContext(hit.id)}`)
  return lines.join('\n\n')
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

// ── Attachments → text ───────────────────────────────────────────────────────
/** Extract plain text from a .docx buffer (Word file = zip; mammoth is pure-JS, no native dep). */
async function extractDocxText(buf: Buffer): Promise<string> {
  try {
    const mammoth = await import('mammoth') as { extractRawText?: (o: { buffer: Buffer }) => Promise<{ value: string }>, default?: { extractRawText: (o: { buffer: Buffer }) => Promise<{ value: string }> } }
    const fn = mammoth.extractRawText ?? mammoth.default?.extractRawText
    if (!fn) return ''
    return (await fn({ buffer: buf })).value ?? ''
  } catch { return '' }
}

/** Turn uploaded files into AttachmentForLlm items (images stay base64, text/docx become text). */
async function attachmentItems(ids: string[]): Promise<AttachmentForLlm[]> {
  const items: AttachmentForLlm[] = []
  for (const id of ids) {
    const a = getAttachment(id)
    if (!a) continue
    try {
      const buf = readFileSync(join(uploadsDir(), a.storage_path))
      if (a.kind === 'image') items.push({ kind: 'image', mime: a.mime, filename: a.filename, base64: buf.toString('base64') })
      else if (a.kind === 'text') items.push({ kind: 'text', mime: a.mime, filename: a.filename, text: buf.toString('utf8') })
      else if (a.kind === 'document') items.push({ kind: 'text', mime: a.mime, filename: a.filename, text: await extractDocxText(buf) })
    } catch { /* skip unreadable */ }
  }
  return items
}

// ── A single intake turn (the conversational loop) ───────────────────────────
/** Compact French context block for the conversational turn (vision for images, inline for text/docx). */
async function extractAttachmentContext(ids: string[], llm: LlmProvider): Promise<string> {
  if (!ids.length || !llm.extractAttachments) return ''
  const items = await attachmentItems(ids)
  return items.length ? llm.extractAttachments(items) : ''
}

/** Full source text for decomposition: message + the COMPLETE text of each attachment (no truncation
 *  for text/docx; vision summary for images). Used by the batch flow, which needs the whole transcript. */
async function fullSourceText(message: string, ids: string[], llm: LlmProvider): Promise<string> {
  const parts: string[] = []
  if (message.trim()) parts.push(message.trim())
  const items = await attachmentItems(ids)
  const images = items.filter(i => i.kind === 'image')
  for (const it of items) {
    if (it.kind === 'text' && it.text) parts.push(`[${it.filename}]\n${it.text}`)
  }
  if (images.length && llm.extractAttachments) parts.push(await llm.extractAttachments(images))
  return parts.join('\n\n')
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

    // Read-only question → answer from current state (whole-product snapshot), no write.
    if (intent.intent === 'query') {
      const hit = searchFeatures(intent.target || text, 1)[0]
      data.target_feature_id = hit?.id ?? null
      const answer = await llm.answerQuery(text, workspaceContext(intent.target || text))
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

    // Triage (signal only) — the AGENT decides, the user never has to. Shape Up: a pitch = one
    // bounded problem. One problem → shape it (1:1). Several distinct problems (e.g. a pasted
    // transcript) → decompose, then the agent GUIDES clarification on the segments IT judges unclear
    // (in chat), and ends on a recap. Triage reads the FULL source (untruncated attachments).
    if (data.mode === 'signal') {
      const triageSource = attachmentIds.length ? await fullSourceText(message, attachmentIds, llm) : text
      const triage = await llm.triage({ raw: triageSource })
      if (triage.mode === 'multi' && triage.count >= 2) {
        // Decompose drives the rest (guided clarify → recap). If it finds nothing to split, fall
        // through to the normal single-signal shaping.
        try { return await decomposeIntake(message, attachmentIds, source, capturedBy) }
        catch { /* degrade to single shaping */ }
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

  // Guided batch clarify: the user is answering the agent's question for the current segment.
  if (loaded.row.state === 'batch_clarify' && data.batch) {
    return advanceBatchClarify(sessionId, data, text, turns)
  }

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
      const answer = await llm.answerQuery(text, workspaceContext(intent.target || text))
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
  const roadmap = roadmapContext()

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
  // Ground truth of what's already built — searched once on the signal, fed to every propose path so
  // the agent dedupes against the real code, not just tickets. Empty when no repo is linked.
  const repo = codeRepo()
  const code = repo ? await codeContextFor(data.raw, { repo }) : ''
  let proposal: Proposal
  let reflect: string

  if (data.mode === 'merge' && data.target_feature_id && data.merge_from_id) {
    // Deliberate merge of two named features → consolidated pitch on the survivor.
    const survivor = get<Feature>('SELECT * FROM features WHERE id = ?', data.target_feature_id)
    const absorbed = get<Feature>('SELECT * FROM features WHERE id = ?', data.merge_from_id)
    const mergeRaw = `Fusion de deux features. À ABSORBER : « ${absorbed?.title} » — problème: ${absorbed?.problem} ; solution: ${absorbed?.solution} ; rabbit holes: ${absorbed?.rabbit_holes} ; no-gos: ${absorbed?.out_of_bounds}. Produis un pitch CONSOLIDÉ qui couvre les deux features.`
    proposal = await llm.propose({
      raw: mergeRaw, transcript: data.transcript, classification, roadmap, code,
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
      raw: data.raw, transcript: data.transcript, classification, roadmap, code,
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
    } else if (target && (target.status === 'bet' || target.status === 'building')) {
      // In a validated cycle → scope is frozen. No mid-cycle amend; shape a new feature for later.
      proposal.action = 'create_feature'
      proposal.target_feature_id = null
      reflect = `« ${target.title} » est déjà engagée dans un cycle (${target.status}) — on ne modifie pas le périmètre d'un pari en cours. Je propose une NOUVELLE feature « ${proposal.proposed_spec.title} » pour un prochain cycle. Tu confirmes, ou tu corriges ?`
    } else {
      proposal.action = 'append'
      proposal.target_feature_id = data.target_feature_id
      reflect = `J'ai compris : « ${proposal.proposed_spec.problem} ». Je propose d'affiner la feature « ${proposal.proposed_spec.title} » (${proposal.confidence * 100 | 0}% de confiance). Tu confirmes, ou tu corriges ?`
    }
  } else {
    proposal = await llm.propose({ raw: data.raw, transcript: data.transcript, candidates, classification, roadmap, code })
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

/** Context for committing one proposal — independent of any intake_session, so both the single
 *  turn AND the batch decomposition reuse the exact same write path (idempotence + per-action). */
export interface CommitContext {
  raw: string
  source: string
  capturedBy: string | null
  attachmentIds?: string[]
  initialAction?: string | null   // agent's first proposal (quality metric); single-turn only
  initialTarget?: string | null
}

/** The ONLY write path into the domain tables. Commits one routing proposal (create/append/merge/
 *  discard) with idempotence on the raw content hash. Shared by intakeCommit (single) and commitBatch. */
export async function commitProposal(proposal: Proposal, ctx: CommitContext): Promise<CommitResult> {
  const llm = await getLlm()
  const contentHash = createHash('sha256').update(ctx.raw.trim().toLowerCase()).digest('hex')

  // Idempotence: same brut already routed → no-op.
  const existing = get<{ id: string, feature_id: string | null }>('SELECT id, feature_id FROM feedback WHERE content_hash = ?', contentHash)
  if (existing?.feature_id) {
    return { feedback_id: existing.id, feature_id: existing.feature_id, action: proposal.action, idempotent: true }
  }

  const data = { raw: ctx.raw, source: ctx.source, captured_by: ctx.capturedBy, attachment_ids: ctx.attachmentIds ?? [], initial_action: ctx.initialAction ?? null, initial_target: ctx.initialTarget ?? null }
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

  return { feedback_id: feedbackId, feature_id: result.feature_id, action: proposal.action, idempotent: false }
}

/** Commit the proposal stored on an intake session (single-signal flow). */
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

  const res = await commitProposal(proposal, {
    raw: data.raw, source: data.source, capturedBy: data.captured_by,
    attachmentIds: data.attachment_ids, initialAction: data.initial_action, initialTarget: data.initial_target,
  })
  saveSession(sessionId, 'committed', loaded.row.turns, data, 1)
  return res
}

// ── Batch decomposition — one dense input (e.g. a transcript) → N routed signals ─────────────
const DEDUP_SEGMENT = 0.8 // two create-segments above this cosine are flagged as likely duplicates

/** Flag likely intra-batch duplicates (UI hint only — the human decides): a second append to the
 *  same feature, or a create near-identical to an earlier create. */
function flagDuplicates(segments: BatchSegment[], embeddings: number[][]): void {
  const seenTarget = new Map<string, string>()
  for (let i = 0; i < segments.length; i++) {
    const p = segments[i].proposal
    if (p.action === 'append' && p.target_feature_id) {
      const first = seenTarget.get(p.target_feature_id)
      if (first) segments[i].duplicate_of = first
      else seenTarget.set(p.target_feature_id, segments[i].id)
    } else if (p.action === 'create_feature') {
      for (let j = 0; j < i; j++) {
        if (segments[j].proposal.action === 'create_feature' && cosine(embeddings[i], embeddings[j]) >= DEDUP_SEGMENT) {
          segments[i].duplicate_of = segments[j].id
          break
        }
      }
    }
  }
}

// ── Guided clarify over a batch (the agent leads, in chat) ───────────────────────────────────
function currentClarifySegment(batch: BatchSession): BatchSegment | undefined {
  const id = batch.clarify_order[batch.cursor]
  return id ? batch.segments.find(s => s.id === id) : undefined
}
const questionFor = (seg: BatchSegment) => `**${seg.signal.title}** — ${seg.clarifying_question}`

/** Opening message: how many sujets, how many need precision, then the first question (if any). */
function batchOpening(batch: BatchSession): string {
  const total = batch.segments.length
  const need = batch.clarify_order.length
  const ready = total - need
  if (!need) return `J'ai repéré **${total} sujets**, tous assez clairs pour être shapés. Voici le récap à valider.`
  const head = `J'ai repéré **${total} sujets**. ${ready > 0 ? `${ready} ${ready > 1 ? 'sont clairs' : 'est clair'}, ` : ''}`
    + `${need} ${need > 1 ? 'ont' : 'a'} besoin d'une précision de ta part — je te les passe un par un.`
  const seg = currentClarifySegment(batch)
  return seg ? `${head}\n\n${questionFor(seg)}` : head
}

/** Recap message once everything is clarified — hands off to the validation screen. */
function batchRecap(batch: BatchSession): string {
  const inc = batch.segments.filter(s => s.include)
  const creates = inc.filter(s => s.proposal.action === 'create_feature').length
  const appends = inc.filter(s => s.proposal.action === 'append').length
  return `C'est clair pour moi. Récap : **${creates} à créer**, **${appends} à rattacher**. Vérifie et valide dans l'écran de validation.`
}

/** Read the full source (message + attachments incl. .docx), segment it into discrete signals, route
 *  each (embed → candidates → propose), then EITHER open guided clarify (agent-decided) or, if every
 *  segment is clear, go straight to the recap. Returns a TurnResponse the chat drives. */
export async function decomposeIntake(message: string, attachmentIds: string[] = [], source = 'manual', capturedBy: string | null = null): Promise<TurnResponse> {
  ensureSchema()
  const llm = await getLlm()
  const raw = await fullSourceText(message, attachmentIds, llm)
  if (!raw.trim()) throw createError({ statusCode: 400, statusMessage: 'Rien à décomposer (source vide)' })

  const roadmap = roadmapContext()
  const signals = await llm.decompose({ raw, roadmap })
  if (!signals.length) throw createError({ statusCode: 422, statusMessage: 'Aucun signal distinct trouvé' })

  const segments: BatchSegment[] = []
  const embeddings: number[][] = []
  for (const signal of signals) {
    const embedding = await llm.embed(signal.problem)
    const candidates = topCandidates(embedding)
    const proposal = await llm.propose({ raw: signal.problem, transcript: [], candidates, classification: signal.classification, roadmap })
    segments.push({ id: newId(), signal, proposal, include: proposal.action !== 'discard', clarifying_question: signal.clarifying_question ?? null, answer: null })
    embeddings.push(embedding)
  }
  flagDuplicates(segments, embeddings)

  // The AGENT decides what needs clarifying (decompose flagged a question) — never the user. Discards
  // are never clarified (they're excluded). Clear segments need nothing.
  const clarify_order = segments.filter(s => s.clarifying_question && s.proposal.action !== 'discard').map(s => s.id)
  const batch: BatchSession = { source, segments, clarify_order, cursor: 0 }
  const state: IntakeState = clarify_order.length ? 'batch_clarify' : 'batch_review'
  const agentMsg = clarify_order.length ? batchOpening(batch) : batchRecap(batch)

  const data: IntakeSessionData = {
    raw, source, captured_by: capturedBy, mode: 'signal',
    target_feature_id: null, merge_from_id: null, initial_action: null, initial_target: null,
    transcript: [{ role: 'agent', text: agentMsg }], proposal: null, candidates: [], attachment_ids: attachmentIds,
    batch,
  }
  const id = newId()
  const now = new Date().toISOString()
  run('INSERT INTO intake_session (id, state, turns, data, committed, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)', id, state, 1, JSON.stringify(data), now, now)
  return { session_id: id, state, agent_message: agentMsg, proposal: null, batch: state === 'batch_review' ? { session_id: id, segments } : undefined }
}

/** Handle one answer during guided clarify: fold it into the current segment (re-shape + re-route so
 *  the precision improves both the pitch AND dedup), then ask the next question or hand off to recap. */
async function advanceBatchClarify(sessionId: string, data: IntakeSessionData, answer: string, turns: number): Promise<TurnResponse> {
  const llm = await getLlm()
  const batch = data.batch!
  const seg = currentClarifySegment(batch)
  if (seg) {
    const enriched = `${seg.signal.problem}\n\n[Précision de l'auteur] ${answer}`
    const embedding = await llm.embed(enriched)
    const candidates = topCandidates(embedding)
    seg.proposal = await llm.propose({ raw: enriched, transcript: [], candidates, classification: seg.signal.classification, roadmap: roadmapContext() })
    seg.signal = { ...seg.signal, problem: enriched, clarifying_question: null }
    seg.answer = answer
    seg.clarifying_question = null
    seg.include = seg.proposal.action !== 'discard'
  }
  batch.cursor += 1

  const next = currentClarifySegment(batch)
  if (next) {
    const msg = questionFor(next)
    data.transcript.push({ role: 'agent', text: msg })
    saveSession(sessionId, 'batch_clarify', turns, data)
    return { session_id: sessionId, state: 'batch_clarify', agent_message: msg, proposal: null }
  }
  const recap = batchRecap(batch)
  data.transcript.push({ role: 'agent', text: recap })
  saveSession(sessionId, 'batch_review', turns, data)
  return { session_id: sessionId, state: 'batch_review', agent_message: recap, proposal: null, batch: { session_id: sessionId, segments: batch.segments } }
}

export interface BatchSelection { id: string; action_override?: Proposal['action']; target_override?: string | null }
export interface BatchCommitResult { created: number; updated: number; discarded: number; results: { id: string; feature_id: string | null; action: Proposal['action'] }[] }

/** Commit the selected segments of a batch session — each via the shared commitProposal write path. */
export async function commitBatch(sessionId: string, selections: BatchSelection[], committedBy: string | null = null): Promise<BatchCommitResult> {
  ensureSchema()
  const loaded = loadSession(sessionId)
  if (!loaded) throw createError({ statusCode: 404, statusMessage: 'Unknown intake session' })
  if (loaded.row.committed) throw createError({ statusCode: 409, statusMessage: 'Session already committed' })
  const { data } = loaded
  if (!data.batch) throw createError({ statusCode: 400, statusMessage: 'Not a batch session' })
  if (committedBy) data.captured_by = committedBy

  const selMap = new Map(selections.map(s => [s.id, s]))
  const results: BatchCommitResult['results'] = []
  let created = 0, updated = 0, discarded = 0
  for (const seg of data.batch.segments) {
    const sel = selMap.get(seg.id)
    if (!sel) continue // not selected → excluded
    const proposal: Proposal = { ...seg.proposal }
    if (sel.action_override) proposal.action = sel.action_override
    if (sel.target_override !== undefined) proposal.target_feature_id = sel.target_override
    if (proposal.action === 'append' && !proposal.target_feature_id) continue // invalid override
    // The source attachment spawned many features → not linked to any one (a transcript↔features
    // many-to-many would need a join table; out of scope). Each segment commits its own problem text.
    const res = await commitProposal(proposal, { raw: seg.signal.problem, source: data.source, capturedBy: data.captured_by })
    if (res.action === 'create_feature') created++
    else if (res.action === 'append' || res.action === 'merge') updated++
    else discarded++
    results.push({ id: seg.id, feature_id: res.feature_id, action: res.action })
  }
  saveSession(sessionId, 'committed', loaded.row.turns, data, 1)
  return { created, updated, discarded, results }
}
