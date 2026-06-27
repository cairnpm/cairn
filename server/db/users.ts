import { all, get, run, tx } from './client'
import { hashPassword } from '../utils/password'
import { newId } from '../utils/id'

export interface User {
  id: string
  name: string
  email: string | null
  password_hash: string
  role: string
  avatar_bg: string | null
  avatar_init: string | null
  avatar_url: string | null
  former_names: string | null
  created_at: string
}

// Denormalized attribution columns that store a person's display NAME (point-in-time audit).
const ATTRIBUTION_NAME_COLUMNS: ReadonlyArray<readonly [string, string]> = [
  ['feature_events', 'actor'], ['decisions', 'decided_by'], ['feedback', 'captured_by'],
  ['attachments', 'uploaded_by'], ['settings', 'updated_by'],
  ['betting_tables', 'owner_name'], ['betting_tables', 'validated_by'],
  ['betting_events', 'actor'], ['betting_votes', 'voter_name'],
]

// Rewrite a person's denormalized name across all audit/attribution columns (used for the one-time
// 'CEO' placeholder reconciliation). Votes dedup by name, so drop a stale-name vote that would
// collide with an existing new-name vote on the same candidate (same person, two names) first.
export function propagateRename(oldName: string, newName: string): void {
  if (!oldName || !newName || oldName === newName) return
  tx(() => {
    run(
      `DELETE FROM betting_votes WHERE voter_name = ? AND EXISTS (
         SELECT 1 FROM betting_votes b2 WHERE b2.table_id = betting_votes.table_id
           AND b2.candidate_id = betting_votes.candidate_id AND b2.voter_name = ?)`,
      oldName, newName,
    )
    for (const [t, c] of ATTRIBUTION_NAME_COLUMNS) run(`UPDATE ${t} SET ${c} = ? WHERE ${c} = ?`, newName, oldName)
  })
}

// Remember a name a user no longer uses, so UserAvatar can still resolve their photo from it.
export function recordFormerName(id: string, formerName: string): void {
  if (!formerName) return
  const u = get<{ former_names: string | null }>('SELECT former_names FROM users WHERE id = ?', id)
  if (!u) return
  let names: string[] = []
  try { names = u.former_names ? JSON.parse(u.former_names) : [] } catch { names = [] }
  if (names.includes(formerName)) return
  run('UPDATE users SET former_names = ? WHERE id = ?', JSON.stringify([...names, formerName]), id)
}

// One-time, idempotent startup reconciliation. (1) The seed attributed all history to the 'CEO'
// placeholder; if the owner has been renamed, propagate that across the audit names + keep 'CEO' as
// a former name. (2) Backfill vote ids from names, then enforce one-vote-per-user at the DB level.
export function reconcileAttribution(): void {
  const owner = get<{ id: string, name: string }>("SELECT id, name FROM users WHERE role = 'owner' ORDER BY created_at LIMIT 1")
  if (owner && owner.name !== 'CEO') {
    propagateRename('CEO', owner.name)
    recordFormerName(owner.id, 'CEO')
  }
  run('UPDATE betting_votes SET voter_id = (SELECT id FROM users WHERE users.name = betting_votes.voter_name) WHERE voter_id IS NULL')
  run('CREATE UNIQUE INDEX IF NOT EXISTS betting_votes_unique_voter ON betting_votes (table_id, candidate_id, voter_id)')
}

// Seed the founding team once (idempotent on the users table — independent of feature seeding,
// since the existing DB already has features). Names MATCH the historical audit actors so all
// past events stay attributed. Default password 'bicycle' (change in Settings → Membres).
export function seedUsersIfEmpty(): void {
  const count = get<{ n: number }>('SELECT COUNT(*) AS n FROM users')?.n ?? 0
  if (count > 0) return
  const team = [
    { name: 'CEO', email: 'ceo@bicycle.local', role: 'owner', bg: '#18181b', init: 'C' },
    { name: 'Alex', email: 'alex@bicycle.local', role: 'member', bg: '#2563eb', init: 'A' },
    { name: 'Sam', email: 'sam@bicycle.local', role: 'member', bg: '#16a34a', init: 'S' },
  ]
  for (const m of team) {
    run(
      `INSERT INTO users (id, name, email, password_hash, role, avatar_bg, avatar_init, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      newId(), m.name, m.email, hashPassword('bicycle'), m.role, m.bg, m.init,
    )
  }
}

export function findUserByEmail(email: string): User | undefined {
  return get<User>('SELECT * FROM users WHERE lower(email) = lower(?)', email)
}

export function listUsers(): Array<Omit<User, 'password_hash'>> {
  return all<Omit<User, 'password_hash'>>(
    'SELECT id, name, email, role, avatar_bg, avatar_init, avatar_url, former_names, created_at FROM users ORDER BY created_at',
  )
}

export function getUserById(id: string): Omit<User, 'password_hash'> | undefined {
  return get<Omit<User, 'password_hash'>>(
    'SELECT id, name, email, role, avatar_bg, avatar_init, avatar_url, former_names, created_at FROM users WHERE id = ?', id,
  )
}

// Update the current user's profile. avatar_init follows the name's first letter; avatar_url is an
// uploaded attachment id (empty string clears it).
export function updateUserProfile(id: string, fields: { name?: string, email?: string | null, avatar_url?: string | null }): Omit<User, 'password_hash'> | undefined {
  const u = get<User>('SELECT * FROM users WHERE id = ?', id)
  if (!u) return undefined
  const name = (fields.name ?? '').trim() || u.name
  const email = fields.email === undefined ? u.email : ((fields.email ?? '').trim() || null)
  const avatarUrl = fields.avatar_url === undefined ? u.avatar_url : ((fields.avatar_url ?? '').trim() || null)
  run('UPDATE users SET name = ?, email = ?, avatar_init = ?, avatar_url = ? WHERE id = ?', name, email, name[0]?.toUpperCase() ?? u.avatar_init, avatarUrl, id)
  // On rename, keep the audit text frozen (point-in-time) but remember the old name so the avatar
  // still resolves from past records attributed to it.
  if (name !== u.name) recordFormerName(id, u.name)
  return getUserById(id)
}
