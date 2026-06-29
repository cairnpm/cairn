import { get, run } from './client'
import { logEvent } from './events'
import { logBettingEvent } from './betting'

// Soft delete / restore is identical across resources except for: the table, which event logger
// fires, the default status a restore falls back to, and whether `updated_at` is touched on the
// write. features touch updated_at; betting_tables do not — that asymmetry is preserved here.
export interface SoftDeleteConfig {
  table: string
  touchUpdatedAt: boolean
  restoreDefault: string
  deletedSummary: (actor: string) => string
  restoredSummary: (actor: string) => string
  log: (id: string, actor: string, action: 'deleted' | 'restored', summary: string) => void
}

export const FEATURE_SOFT_DELETE: SoftDeleteConfig = {
  table: 'features',
  touchUpdatedAt: true,
  restoreDefault: 'shaped',
  deletedSummary: actor => `${actor} a supprimé la feature`,
  restoredSummary: actor => `${actor} a réactivé la feature`,
  log: (id, actor, action, summary) => logEvent(id, actor, action, summary),
}

export const BETTING_SOFT_DELETE: SoftDeleteConfig = {
  table: 'betting_tables',
  touchUpdatedAt: false,
  restoreDefault: 'open',
  deletedSummary: actor => `${actor} a supprimé la table`,
  restoredSummary: actor => `${actor} a réactivé la table`,
  log: (id, actor, action, summary) => logBettingEvent(id, actor, action, summary),
}

/**
 * Flip a row to 'deleted', remembering the prior status in prev_status so it can be restored.
 * Returns the resulting status, or null if the row doesn't exist (caller maps that to a 404).
 * Idempotent: already-deleted rows return without re-logging an event.
 */
export function softDelete(cfg: SoftDeleteConfig, id: string, actor = 'inconnu'): { status: string } | null {
  const row = get<{ status: string }>(`SELECT status FROM ${cfg.table} WHERE id = ?`, id)
  if (!row) return null
  if (row.status === 'deleted') return { status: 'deleted' }

  if (cfg.touchUpdatedAt) {
    run(`UPDATE ${cfg.table} SET prev_status = status, status = 'deleted', updated_at = ? WHERE id = ?`, new Date().toISOString(), id)
  } else {
    run(`UPDATE ${cfg.table} SET prev_status = status, status = 'deleted' WHERE id = ?`, id)
  }
  cfg.log(id, actor, 'deleted', cfg.deletedSummary(actor))
  return { status: 'deleted' }
}

/**
 * Restore a soft-deleted row to its prev_status (or the config's default), clearing prev_status.
 * Returns the resulting status, or null if the row doesn't exist (caller maps that to a 404).
 * No-op (returns the current status) when the row isn't actually deleted.
 */
export function softRestore(cfg: SoftDeleteConfig, id: string, actor = 'inconnu'): { status: string } | null {
  const row = get<{ status: string, prev_status: string | null }>(`SELECT status, prev_status FROM ${cfg.table} WHERE id = ?`, id)
  if (!row) return null
  if (row.status !== 'deleted') return { status: row.status }

  const restored = row.prev_status || cfg.restoreDefault
  if (cfg.touchUpdatedAt) {
    run(`UPDATE ${cfg.table} SET status = ?, prev_status = NULL, updated_at = ? WHERE id = ?`, restored, new Date().toISOString(), id)
  } else {
    run(`UPDATE ${cfg.table} SET status = ?, prev_status = NULL WHERE id = ?`, restored, id)
  }
  cfg.log(id, actor, 'restored', cfg.restoredSummary(actor))
  return { status: restored }
}
