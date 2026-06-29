import { all, run } from './client'

// Shared append-only activity log helper. feature_events and betting_events are structural twins:
// same columns (seq, <fk>, actor, actor_type, action, summary, detail, created_at), same actor
// fallback, same JSON detail encoding, same seq ordering. A config picks the table + fk column.
export interface ActivityTable {
  table: string // *_events table name
  fk: string // foreign-key column to the owning entity
}

export const FEATURE_EVENTS: ActivityTable = { table: 'feature_events', fk: 'feature_id' }
export const BETTING_EVENTS: ActivityTable = { table: 'betting_events', fk: 'table_id' }

/**
 * Append an activity event. created_at is written via SQLite `datetime('now')` for BOTH tables so
 * the two logs share one timestamp format (previously feature_events stored ISO with T/Z and
 * betting_events stored space-separated UTC — app/utils/time.ts parse() tolerates legacy rows).
 * `seq` auto-increments and `actor_type` defaults to 'user', exactly as before.
 */
export function logActivity(
  cfg: ActivityTable,
  entityId: string,
  actor: string | null,
  action: string,
  summary: string,
  detail?: Record<string, unknown>,
  actorType: string = 'user',
): void {
  run(
    `INSERT INTO ${cfg.table} (${cfg.fk}, actor, actor_type, action, summary, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
    entityId, actor || 'inconnu', actorType, action, summary, detail ? JSON.stringify(detail) : null,
  )
}

/** Activity timeline for one entity, newest first. */
export function listActivity(cfg: ActivityTable, entityId: string) {
  return all(
    `SELECT seq, actor, actor_type, action, summary, detail, created_at FROM ${cfg.table} WHERE ${cfg.fk} = ? ORDER BY seq DESC`,
    entityId,
  )
}
