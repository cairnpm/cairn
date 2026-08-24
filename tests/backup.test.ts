import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// @ts-expect-error — bin/backup.mjs is checkJs'd via bin/tsconfig.json, not the app project.
import { backup, prune } from '../bin/backup.mjs'

// Own temp dir per test: never the dev DB, never .data/.
let dir: string
let src: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cairn-backup-'))
  src = join(dir, 'app.db')
  const db = new DatabaseSync(src)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('CREATE TABLE features (id TEXT PRIMARY KEY, title TEXT)')
  db.prepare('INSERT INTO features VALUES (?, ?)').run('f1', 'dark mode')
  db.close()
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('backup', () => {
  it('snapshots the live DB into a self-contained file', () => {
    const out = backup({ env: { NUXT_DB_URL: `file:${src}` }, now: new Date('2026-08-24T21:30:05Z') })
    expect(out).toBe(join(dir, 'backups', 'cairn-2026-08-24T21-30-05.db'))
    const snap = new DatabaseSync(out, { readOnly: true })
    expect(snap.prepare('SELECT title FROM features WHERE id = ?').get('f1')).toEqual({ title: 'dark mode' })
    snap.close()
    // VACUUM INTO checkpoints as it copies: the snapshot needs no sidecar files to be readable.
    expect(readdirSync(join(dir, 'backups'))).toEqual(['cairn-2026-08-24T21-30-05.db'])
  })

  it('leaves the source untouched and writable — the connection is read-only', () => {
    backup({ env: { NUXT_DB_URL: `file:${src}` }, now: new Date('2026-08-24T21:30:05Z') })
    const db = new DatabaseSync(src)
    db.prepare('INSERT INTO features VALUES (?, ?)').run('f2', 'still writable')
    expect(db.prepare('SELECT COUNT(*) AS n FROM features').get()).toEqual({ n: 2 })
    db.close()
  })

  it('refuses to overwrite an existing snapshot', () => {
    const opts = { env: { NUXT_DB_URL: `file:${src}` }, now: new Date('2026-08-24T21:30:05Z') }
    backup(opts)
    expect(() => backup(opts)).toThrow()
  })

  it('prunes all but the newest N — an unrotated cron fills the volume', () => {
    const backups = join(dir, 'backups')
    for (let i = 1; i <= 5; i++) backup({ env: { NUXT_DB_URL: `file:${src}` }, now: new Date(`2026-08-0${i}T00:00:00Z`) })
    writeFileSync(join(backups, 'unrelated.txt'), 'keep me')
    prune(backups, 2)
    const left = readdirSync(backups).sort()
    expect(left).toEqual(['cairn-2026-08-04T00-00-00.db', 'cairn-2026-08-05T00-00-00.db', 'unrelated.txt'])
  })
})
