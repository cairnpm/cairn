#!/usr/bin/env node
// Consistent snapshot of the live SQLite database — `VACUUM INTO`, which is SQLite's own answer to
// "how do I back up a database that's being written to". Copying app.db with cp/tar while the server
// runs can capture a torn file (the WAL moves between the two reads); VACUUM INTO takes a read lock
// and emits ONE self-contained, already-checkpointed file. Zero deps, zero native deps.
//
// The connection is opened READ-ONLY: a backup can never write to, lock out, or corrupt the running
// instance. Uploads are NOT included — they're write-once files, safe to tar live (see DEPLOY.md).

import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parseArgs } from 'node:util'

/** Same resolution as server/db/client.ts — bin/ is standalone (no TS imports), so it's restated. */
function dbPath(env = process.env) {
  const raw = env.NUXT_DB_URL || 'file:.data/app.db'
  return raw.startsWith('file:') ? (raw.slice('file:'.length).split('?')[0] ?? raw) : raw
}

/** `2026-08-24T21-30-05` — sortable, and colon-free so it's a valid filename everywhere. @param {Date} now */
function stamp(now) {
  return now.toISOString().slice(0, 19).replace(/:/g, '-')
}

/**
 * Delete all but the newest `keep` snapshots in `dir`. An unrotated cron fills the volume, which
 * takes the instance down — the failure mode a backup was supposed to prevent.
 * @param {string} dir @param {number} keep @returns {string[]} the files removed
 */
export function prune(dir, keep) {
  if (!Number.isFinite(keep) || keep <= 0) return []
  // Ordered by NAME, not mtime: the filename carries a sortable ISO stamp, two snapshots can share
  // an mtime second, and a restore or rsync rewrites mtimes. Newest first.
  const snaps = readdirSync(dir)
    .filter(f => f.startsWith('cairn-') && f.endsWith('.db'))
    .sort()
    .reverse()
  const stale = snaps.slice(keep)
  for (const f of stale) rmSync(join(dir, f))
  return stale
}

/**
 * Write one snapshot. Returns its path.
 * @param {{ out?: string, keep?: number, env?: Record<string, string | undefined>, now?: Date }} [opts]
 */
export function backup(opts = {}) {
  const env = opts.env ?? process.env
  const src = dbPath(env)
  const out = opts.out ?? join(dirname(src), 'backups', `cairn-${stamp(opts.now ?? new Date())}.db`)
  mkdirSync(dirname(out), { recursive: true })
  const db = new DatabaseSync(src, { readOnly: true })
  try {
    // Bound as a literal: VACUUM INTO takes an expression, not a bindable parameter. `out` is
    // operator-supplied (a CLI flag), never user input — quotes are escaped all the same.
    db.exec(`VACUUM INTO '${out.replaceAll("'", "''")}'`)
  }
  finally { db.close() }
  if (opts.keep) prune(dirname(out), opts.keep)
  return out
}

// Entrypoint — skipped when imported by tests.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({ args: process.argv.slice(2), options: { out: { type: 'string' }, keep: { type: 'string' } } })
  try {
    // Only the path on stdout, so `TARBALL=$(node bin/backup.mjs)` works in a cron script.
    process.stdout.write(`${backup({ out: values.out, keep: values.keep ? Number(values.keep) : undefined })}\n`)
  }
  catch (err) {
    // `catch` binds `unknown` under strict — narrow rather than cast.
    process.stderr.write(`backup failed: ${err instanceof Error ? err.message : String(err)}\n`)
    process.exit(1)
  }
}
