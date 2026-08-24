import { all, run } from './client'
import { logEvent } from './events'
import { STALE_STATUSES, sqlIn } from '../domain/status'

const STALE_DAYS = Number(process.env.NUXT_STALE_DAYS ?? 14)

/**
 * Shape Up anti-backlog rule: a `shaped` or `shaping` feature not bet on within N days is marked stale
 * (it must be re-defended to come back) — so a `shaping` parking lot can't quietly become a graveyard.
 * Lazy + idempotent — run on reads. No auto-carry.
 */
export function markStaleFeatures(days = STALE_DAYS): void {
  const newlyStale = all<{ id: string, title: string }>(
    // updated_at is ISO-8601 (with 'T'/'Z'); datetime() normalizes it to SQLite's format so the
    // string comparison against datetime('now', …) is valid (raw ISO sorts wrong on the 'T').
    `SELECT id, title FROM features
     WHERE status IN (${sqlIn(STALE_STATUSES)}) AND stale = 0 AND datetime(updated_at) < datetime('now', ?)`,
    `-${days} days`,
  )
  if (!newlyStale.length) return
  for (const f of newlyStale) {
    run('UPDATE features SET stale = 1 WHERE id = ?', f.id)
    logEvent(f.id, 'system', 'stale', `Marquée stale — non pariée depuis plus de ${days} jours`, { days }, 'system')
  }
}
