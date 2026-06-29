import { createHash, randomBytes } from 'node:crypto'
import { all, get, run, tx } from './client'
import { newId } from '../utils/id'
import { createUser, findUserByEmail } from './users'

// Token invitations. The shareable link carries a high-entropy raw token; we persist only its
// sha256 hash, so a DB leak can't be used to join. Single-use (accepted_at) + expiry (SQL-computed
// so it compares cleanly against datetime('now')).
export interface Invitation {
  id: string
  token_hash: string
  email: string
  role: string
  invited_by: string | null
  expires_at: string
  accepted_at: string | null
  created_at: string
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** Create (replacing any earlier pending one) an invite for an email. Returns the RAW token once. */
export function createInvitation(email: string, role: 'owner' | 'member', invitedBy: string | null): { token: string; email: string; role: string } | { error: string } {
  const e = email.trim().toLowerCase()
  if (!EMAIL_RE.test(e)) return { error: 'Email invalide' }
  if (findUserByEmail(e)) return { error: 'Un compte existe déjà pour cet email' }
  const token = randomBytes(32).toString('base64url')
  tx(() => {
    run('DELETE FROM invitations WHERE lower(email) = ? AND accepted_at IS NULL', e) // one live link per person
    run(
      `INSERT INTO invitations (id, token_hash, email, role, invited_by, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now', '+7 days'), datetime('now'))`,
      newId(), hashToken(token), e, role, invitedBy,
    )
  })
  return { token, email: e, role }
}

/** A pending, non-expired invite matching this raw token, else undefined. */
export function getValidInvitation(token: string): Invitation | undefined {
  if (!token) return undefined
  return get<Invitation>(
    "SELECT * FROM invitations WHERE token_hash = ? AND accepted_at IS NULL AND expires_at > datetime('now')",
    hashToken(token),
  )
}

/** Accept an invite: create the member + mark it used, atomically. */
export function acceptInvitation(token: string, name: string, password: string): { user: ReturnType<typeof createUser> } | { error: string } {
  const inv = getValidInvitation(token)
  if (!inv) return { error: 'Invitation invalide ou expirée' }
  if (!name.trim()) return { error: 'Nom requis' }
  if ((password ?? '').length < 8) return { error: 'Le mot de passe doit faire au moins 8 caractères' }
  if (findUserByEmail(inv.email)) return { error: 'Un compte existe déjà pour cet email' }
  let user!: ReturnType<typeof createUser>
  tx(() => {
    user = createUser({ name, email: inv.email, password, role: inv.role })
    run("UPDATE invitations SET accepted_at = datetime('now') WHERE id = ?", inv.id)
  })
  return { user }
}

export interface PendingInvite { id: string; email: string; role: string; expires_at: string; created_at: string }
export function listPendingInvitations(): PendingInvite[] {
  return all<PendingInvite>(
    "SELECT id, email, role, expires_at, created_at FROM invitations WHERE accepted_at IS NULL AND expires_at > datetime('now') ORDER BY created_at DESC",
  )
}

export function revokeInvitation(id: string): void {
  run('DELETE FROM invitations WHERE id = ? AND accepted_at IS NULL', id)
}
