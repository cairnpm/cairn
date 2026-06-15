import { createHash } from 'node:crypto'
import { all, get, run, tx } from '../db/client'
import { ensureSchema } from '../db/schema'
import type {
  Candidate, Feature, IntakeSessionData, Proposal, TurnResponse,
} from '../domain/types'
import { getLlm } from '../llm/provider'
import { cosine, decodeEmbedding, encodeEmbedding, localEmbed } from '../utils/embedding'
import { newId } from '../utils/id'

const MAX_TURNS = 5          // bounded loop — must converge to a commit
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
export async function intakeTurn(sessionId: string | null, message: string, source = 'manual', capturedBy: string | null = null): Promise<TurnResponse> {
  ensureSchema()
  const llm = await getLlm()
  const text = message.trim()

  // First turn — open a session.
  if (!sessionId) {
    const id = newId()
    const data: IntakeSessionData = { raw: text, source, captured_by: capturedBy, transcript: [{ role: 'user', text }], proposal: null, candidates: [] }
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

  // Ask at most until the cap; once capped, force a proposal.
  if (turns < MAX_TURNS) {
    const question = await llm.clarify({ raw: data.raw, transcript: data.transcript })
    if (question) {
      data.transcript.push({ role: 'agent', text: question })
      saveSession(id, 'clarify', turns, data)
      return { session_id: id, state: 'clarify', agent_message: question, proposal: null }
    }
  }

  // Propose (reflect + route).
  const classification = await llm.classify(data.raw)
  const proposal: Proposal = await llm.propose({ raw: data.raw, transcript: data.transcript, candidates, classification })
  data.proposal = proposal

  const reflect = proposal.action === 'append'
    ? `J'ai compris : « ${proposal.proposed_spec.problem} ». Je propose de le rattacher à une feature existante (${proposal.confidence * 100 | 0}% de similarité). Tu confirmes, ou tu corriges ?`
    : `J'ai compris : « ${proposal.proposed_spec.problem} ». Aucun doublon fort — je propose de créer une nouvelle feature « ${proposal.proposed_spec.title} » (appétit ${proposal.proposed_spec.appetite}). Tu confirmes, ou tu corriges ?`
  data.transcript.push({ role: 'agent', text: reflect })
  saveSession(id, 'propose', turns, data)
  return { session_id: id, state: 'propose', agent_message: reflect, proposal }
}

// ── Commit — the ONLY write path into the domain tables ──────────────────────
export interface CommitResult {
  feedback_id: string
  feature_id: string
  action: Proposal['action']
  idempotent: boolean
}

export async function intakeCommit(sessionId: string): Promise<CommitResult> {
  ensureSchema()
  const loaded = loadSession(sessionId)
  if (!loaded) throw createError({ statusCode: 404, statusMessage: 'Unknown intake session' })
  if (loaded.row.committed) throw createError({ statusCode: 409, statusMessage: 'Session already committed' })
  const { data } = loaded
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

  const result = tx<{ feature_id: string }>(() => {
    let featureId: string

    if (proposal.action === 'append' && proposal.target_feature_id) {
      featureId = proposal.target_feature_id
      const feat = get<Feature>('SELECT * FROM features WHERE id = ?', featureId)
      if (!feat) throw createError({ statusCode: 409, statusMessage: 'Target feature no longer exists' })
      // Re-embed the feature from its shape + accumulated signals.
      const priorContents = all<{ content: string }>('SELECT content FROM feedback WHERE feature_id = ?', featureId).map(r => r.content)
      const merged = [feat.title, feat.problem, ...priorContents, data.raw].join(' \n ')
      run(
        'UPDATE features SET signal_count = signal_count + 1, stale = 0, embedding = ?, updated_at = ? WHERE id = ?',
        encodeEmbedding(localEmbed(merged)), now, featureId,
      )
    } else {
      // create_feature
      featureId = newId()
      const spec = proposal.proposed_spec
      run(
        `INSERT INTO features (id, title, problem, appetite, out_of_bounds, status, stale, signal_count, embedding, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'shaped', 0, 1, ?, ?, ?)`,
        featureId, spec.title, spec.problem, spec.appetite, spec.out_of_bounds || null,
        encodeEmbedding(localEmbed([spec.title, spec.problem].join(' \n '))), now, now,
      )
    }

    run(
      `INSERT INTO feedback (id, content, source, captured_by, classification, status, feature_id, content_hash, embedding, created_at)
       VALUES (?, ?, ?, ?, ?, 'routed', ?, ?, ?, ?)`,
      feedbackId, data.raw, data.source, data.captured_by, proposal.classification, featureId, contentHash,
      encodeEmbedding(fbEmbedding), now,
    )

    run(
      `INSERT INTO routing_log (id, feedback_id, action, target_feature_id, confidence, rationale, model, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      newId(), feedbackId, proposal.action, featureId, proposal.confidence, proposal.rationale, llm.name, now,
    )

    return { feature_id: featureId }
  })

  saveSession(sessionId, 'committed', loaded.row.turns, data, 1)
  return { feedback_id: feedbackId, feature_id: result.feature_id, action: proposal.action, idempotent: false }
}
