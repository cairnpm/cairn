import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync, type StatementSync } from 'node:sqlite'

let _db: DatabaseSync | null = null

/**
 * Embedded SQLite via Node's built-in `node:sqlite` — zero native deps, nothing
 * to compile into the Fly image (proven on the sister project).
 * - Local/dev: `.data/app.db` (NUXT_DB_URL unset).
 * - Production (Fly): NUXT_DB_URL=file:/data/app.db on a persistent volume.
 *
 * SQLite is single-writer: pin the app to ONE machine (no horizontal autoscale).
 */
function dbPath(): string {
  const raw = process.env.NUXT_DB_URL || 'file:.data/app.db'
  return raw.startsWith('file:') ? (raw.slice('file:'.length).split('?')[0] ?? raw) : raw
}

export function db(): DatabaseSync {
  if (_db) return _db
  const path = dbPath()
  try { mkdirSync(dirname(path), { recursive: true }) } catch { /* exists */ }
  _db = new DatabaseSync(path)
  _db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;')
  return _db
}

/** Directory holding the DB — uploads live alongside it so they share the Fly volume. */
export function dataDir(): string {
  return dirname(dbPath())
}

type Arg = string | number | bigint | null | Uint8Array
export function run(sql: string, ...args: Arg[]) {
  return db().prepare(sql).run(...args)
}
export function all<T = Record<string, unknown>>(sql: string, ...args: Arg[]): T[] {
  return (db().prepare(sql) as StatementSync).all(...args) as T[]
}
export function get<T = Record<string, unknown>>(sql: string, ...args: Arg[]): T | undefined {
  return (db().prepare(sql) as StatementSync).get(...args) as T | undefined
}

/** Run a function inside a transaction (single-writer, so this just brackets it). */
export function tx<T>(fn: () => T): T {
  const d = db()
  d.exec('BEGIN')
  try {
    const out = fn()
    d.exec('COMMIT')
    return out
  } catch (err) {
    try { d.exec('ROLLBACK') } catch { /* noop */ }
    throw err
  }
}
