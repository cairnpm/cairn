import { all, get, run } from './client'
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
  created_at: string
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
    'SELECT id, name, email, role, avatar_bg, avatar_init, created_at FROM users ORDER BY created_at',
  )
}
