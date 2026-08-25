import { get, run } from '../db/client'
import { logEvent } from '../db/events'
import type { FeatureStatus } from './types'

/**
 * Execution progress — the ONLY place a feature's status moves once it's in a cycle. Shaping owns the
 * pitch (via intake); this owns the state of the work, which is why it lives outside the agent: nothing
 * automated gets to declare work shipped.
 *
 * `bet ⇄ building` moves freely: neither direction touches the bet, the hill or the scope, so stepping
 * back just says "we're not on it right now" (and undoes a mis-click). `building → done` is one-way —
 * a delivered solution is superseded by a new iteration (intake §6), never reopened. Leaving the cycle
 * altogether is NOT a status move: that's `dropFeatureFromCycle` below.
 */
export const EXECUTION_FLOW: Partial<Record<FeatureStatus, FeatureStatus>> = {
  bet: 'building',
  building: 'done',
}
export const EXECUTION_BACK: Partial<Record<FeatureStatus, FeatureStatus>> = {
  building: 'bet',
}

export type AdvanceError = 'not-found' | 'not-advanceable' | 'wrong-step'
export type DropError = 'not-found' | 'not-in-cycle' | 'no-rationale'

export function nextExecutionStatus(status: FeatureStatus | null | undefined): FeatureStatus | null {
  return (status && EXECUTION_FLOW[status]) || null
}
export function previousExecutionStatus(status: FeatureStatus | null | undefined): FeatureStatus | null {
  return (status && EXECUTION_BACK[status]) || null
}

/** Move one step. `expected` is the status the caller saw, so a stale UI can't skip a step. */
export function moveFeatureStatus(
  featureId: string, expected: FeatureStatus, direction: 'forward' | 'back', actor: string | null,
): { ok: true; status: FeatureStatus } | { ok: false; error: AdvanceError } {
  const feature = get<{ status: FeatureStatus }>('SELECT status FROM features WHERE id = ?', featureId)
  if (!feature) return { ok: false, error: 'not-found' }

  const next = direction === 'forward' ? nextExecutionStatus(feature.status) : previousExecutionStatus(feature.status)
  if (!next) return { ok: false, error: 'not-advanceable' }
  if (feature.status !== expected) return { ok: false, error: 'wrong-step' }

  const now = new Date().toISOString()
  run('UPDATE features SET status = ?, updated_at = ? WHERE id = ?', next, now, featureId)
  logEvent(featureId, actor, 'status_changed', `${feature.status} → ${next}`, { from: feature.status, to: next })
  return { ok: true, status: next }
}

/**
 * Shape Up's circuit breaker: the cycle ended and the work didn't ship. The bet is OFF — the feature
 * drops out of the hill and returns to the pool as `shaped`, where it has to win a betting table again.
 * Deliberately not a status button: it undoes a commitment, so the "why" is mandatory and recorded.
 */
export function dropFeatureFromCycle(
  featureId: string, rationale: string, actor: string | null,
): { ok: true } | { ok: false; error: DropError } {
  if (!rationale.trim()) return { ok: false, error: 'no-rationale' }
  const feature = get<{ status: FeatureStatus; hill_id: string | null }>(
    'SELECT status, hill_id FROM features WHERE id = ?', featureId,
  )
  if (!feature) return { ok: false, error: 'not-found' }
  if (feature.status !== 'bet' && feature.status !== 'building') return { ok: false, error: 'not-in-cycle' }

  const now = new Date().toISOString()
  // Back in the pool with a clean slate: `stale` restarts from now, so it gets a fair window to be
  // re-defended instead of coming back already flagged.
  run(
    `UPDATE features SET status = 'shaped', hill_id = NULL, stale = 0, updated_at = ? WHERE id = ?`,
    now, featureId,
  )
  logEvent(featureId, actor, 'dropped', `${feature.status} → shaped`, { from: feature.status, hill_id: feature.hill_id, rationale })
  return { ok: true }
}
