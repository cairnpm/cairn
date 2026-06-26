import { run } from '../db/client'
import { logEvent } from '../db/events'
import { newId } from '../utils/id'
import type { Verdict } from './types'

// The single bet/pass/defer write path — shared by the manual decision endpoint and betting-table
// validation. Caller is responsible for the surrounding transaction + any status guards.
export function recordDecision(opts: {
  featureId: string
  verdict: Verdict
  hillId: string | null
  rationale: string
  decidedBy: string | null
  appetite?: string | null
}): string {
  const { featureId, verdict, hillId, rationale, decidedBy, appetite = null } = opts
  const id = newId()
  const now = new Date().toISOString()
  run(
    `INSERT INTO decisions (id, feature_id, hill_id, verdict, appetite, rationale, decided_by, decided_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id, featureId, hillId, verdict, appetite, rationale, decidedBy, now,
  )
  if (verdict === 'bet') {
    run('UPDATE features SET status = ?, hill_id = ?, stale = 0, updated_at = ? WHERE id = ?', 'bet', hillId, now, featureId)
  }
  // pass / defer: feature stays `shaped` (no auto-carry; eligible for stale).
  const label = verdict === 'bet' ? 'Parié (bet)' : verdict === 'defer' ? 'Reporté (defer)' : 'Écarté (pass)'
  logEvent(featureId, decidedBy, verdict, `${label} par ${decidedBy || 'inconnu'}`, { rationale, hill_id: hillId })
  return id
}
