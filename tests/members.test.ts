import { createHash } from 'node:crypto'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Hermetic + replayable: the whole suite runs on a throwaway SQLite DB (wiped before and after), so
// it never touches .data/app.db and gives identical results on every run. NUXT_DB_URL is read lazily
// by the db client, so setting it here — before any db() call — is enough to redirect everything.
const TEST_DB = join(tmpdir(), 'cairn-members-test.db')
function wipe() { for (const s of ['', '-wal', '-shm']) { try { rmSync(TEST_DB + s) } catch { /* absent */ } } }
process.env.NUXT_DB_URL = `file:${TEST_DB}`
wipe()

const { ensureSchema } = await import('../server/db/schema')
const { seedUsersIfEmpty, findUserByEmail, listUsers, changePassword, setUserDisabled, setUserRole, countActiveOwners } = await import('../server/db/users')
const { verifyPassword } = await import('../server/utils/password')
const { createInvitation, getValidInvitation, acceptInvitation, listPendingInvitations, revokeInvitation } = await import('../server/db/invitations')
const { run } = await import('../server/db/client')

// The /api/auth login + logout endpoints just wrap nuxt-auth-utils sessions around this credential
// check; we model the session as a local variable so the journey reads end-to-end.
let session: { id: string; name: string; role: string } | null = null
function login(email: string, password: string): boolean {
  const u = findUserByEmail(email)
  if (!u || u.disabled_at || !verifyPassword(password, u.password_hash)) return false
  session = { id: u.id, name: u.name, role: u.role }
  return true
}
function logout() { session = null }

/** Narrow a `{...} | { error }` result to its success shape (throws on error). */
function ok<T extends object>(res: T | { error: string }): T {
  if ('error' in res) throw new Error(`attendu succès, reçu erreur: ${res.error}`)
  return res
}

const OWNER = 'ceo@cairn.local'

beforeAll(() => {
  ensureSchema()
  seedUsersIfEmpty() // CEO (owner) + Alex + Sam, password 'cairn'
})
afterAll(wipe)

describe('membres — login / invitation / logout / join', () => {
  it('parcours complet : login owner → invite → logout → join → login du nouveau membre', () => {
    // 1. LOGIN (owner)
    expect(login(OWNER, 'cairn')).toBe(true)
    expect(session?.role).toBe('owner')
    expect(login(OWNER, 'mauvais')).toBe(false) // wrong password rejected

    // 2. INVITE (owner creates a token link for a new email)
    const owner = findUserByEmail(OWNER)!
    const inv = ok(createInvitation('newbie@cairn.local', 'member', owner.id))
    expect(inv.token).toBeTruthy()
    expect(inv.email).toBe('newbie@cairn.local')
    expect(getValidInvitation(inv.token)?.email).toBe('newbie@cairn.local') // link resolves
    expect(listPendingInvitations().some(i => i.email === 'newbie@cairn.local')).toBe(true)

    // 3. LOGOUT (owner leaves; the invitee acts on their own)
    logout()
    expect(session).toBeNull()

    // 4. JOIN (invitee opens the link, picks a name + password → account created)
    const usersBefore = listUsers().length
    const joined = ok(acceptInvitation(inv.token, 'Newbie', 'sup3rsecret'))
    expect(joined.user.email).toBe('newbie@cairn.local')
    expect(joined.user.role).toBe('member')
    expect(listUsers().length).toBe(usersBefore + 1)

    // 5. The new member can now LOGIN with the credentials they set
    expect(login('newbie@cairn.local', 'sup3rsecret')).toBe(true)
    expect(session?.name).toBe('Newbie')

    // 6. The invite is SINGLE-USE — the link no longer works
    expect(getValidInvitation(inv.token)).toBeUndefined()
    expect('error' in acceptInvitation(inv.token, 'Re', 'sup3rsecret')).toBe(true)
    expect(listPendingInvitations().some(i => i.email === 'newbie@cairn.local')).toBe(false)
  })

  it('invitation : doublon, mot de passe faible et expiration refusés', () => {
    // An email that already has an account can't be re-invited.
    expect('error' in createInvitation(OWNER, 'member', null)).toBe(true)

    // Weak password is rejected and creates no account.
    const inv = ok(createInvitation('weak@cairn.local', 'member', null))
    const before = listUsers().length
    expect('error' in acceptInvitation(inv.token, 'Weak', 'short')).toBe(true)
    expect(listUsers().length).toBe(before)
    revokeInvitation(getValidInvitation(inv.token)!.id) // cleanup; revoke disables the link
    expect(getValidInvitation(inv.token)).toBeUndefined()

    // An expired token never resolves (insert one in the past directly).
    const token = 'expired-token-fixture'
    const hash = createHash('sha256').update(token).digest('hex')
    run(
      `INSERT INTO invitations (id, token_hash, email, role, expires_at, created_at)
       VALUES ('inv-exp', ?, 'late@cairn.local', 'member', datetime('now', '-1 day'), datetime('now'))`,
      hash,
    )
    expect(getValidInvitation(token)).toBeUndefined()
  })

  it('mot de passe : changement vérifié par l\'ancien', () => {
    const u = findUserByEmail('newbie@cairn.local')!
    expect('error' in changePassword(u.id, 'mauvais', 'nouveaupass1')).toBe(true)   // wrong current
    expect('error' in changePassword(u.id, 'sup3rsecret', 'court')).toBe(true)        // too short
    ok(changePassword(u.id, 'sup3rsecret', 'nouveaupass1'))                           // success
    expect(login('newbie@cairn.local', 'sup3rsecret')).toBe(false)                 // old no longer works
    expect(login('newbie@cairn.local', 'nouveaupass1')).toBe(true)                 // new works
  })

  it('garde-fous : dernier owner protégé, membre retiré ne peut plus se connecter', () => {
    const owner = findUserByEmail(OWNER)!
    expect(countActiveOwners()).toBe(1)
    expect('error' in setUserRole(owner.id, 'member')).toBe(true)     // can't demote the last owner
    expect('error' in setUserDisabled(owner.id, true)).toBe(true)     // can't remove the last owner

    // Remove a member (soft-disable) → can't log in, drops off the active list, id/name preserved.
    const newbie = findUserByEmail('newbie@cairn.local')!
    ok(setUserDisabled(newbie.id, true))
    expect(login('newbie@cairn.local', 'nouveaupass1')).toBe(false)
    expect(listUsers().some(m => m.id === newbie.id)).toBe(false)
    expect(findUserByEmail('newbie@cairn.local')).toBeTruthy() // row still there for attribution
  })
})
