import { run } from './client'

export type EventAction = 'created' | 'signal_added' | 'field_updated' | 'bet' | 'pass' | 'defer' | 'pr_linked' | 'pr_merged' | 'stale' | 'merged' | 'discarded'
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
  run(
    `INSERT INTO feature_events (feature_id, actor, actor_type, action, summary, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    featureId, actor || 'inconnu', actorType, action, summary,
    detail ? JSON.stringify(detail) : null, new Date().toISOString(),
  )
}
