import { FEATURE_EVENTS, listActivity, logActivity } from './activity'

// Feature activity timeline (newest first) — shared by the detail read and mutating endpoints so
// the history stays in sync after a change.
export function listFeatureEvents(featureId: string) {
  return listActivity(FEATURE_EVENTS, featureId)
}

export type EventAction = 'created' | 'signal_added' | 'field_updated' | 'bet' | 'pass' | 'defer' | 'pr_linked' | 'pr_merged' | 'stale' | 'merged' | 'discarded' | 'deleted' | 'restored' | 'assigned' | 'unassigned'
export type ActorType = 'user' | 'agent' | 'system'

/**
 * Append a feature activity event (collaborative audit).
 * actor–action–object–timestamp; `detail` carries before/after for replacements.
 */
export function logEvent(
  featureId: string,
  actor: string | null,
  action: EventAction,
  summary: string,
  detail?: Record<string, unknown>,
  actorType: ActorType = 'user',
) {
  logActivity(FEATURE_EVENTS, featureId, actor, action, summary, detail, actorType)
}
