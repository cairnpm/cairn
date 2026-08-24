import { run } from './client'

// Nothing ever deleted an intake_session, so the table grew unbounded. We deliberately don't keep old
// conversations (the durable record — feature, feedback, routing_log — is written at commit), so purge:
//   - committed sessions after a short window (their output is already saved),
//   - abandoned (uncommitted) sessions after a longer one — must OUTLAST the resume window, since the
//     client's resume pointer can be arbitrarily stale.
const COMMITTED_DAYS = Number(process.env.NUXT_INTAKE_PURGE_COMMITTED_DAYS ?? 2)
const STALE_DAYS = Number(process.env.NUXT_INTAKE_PURGE_STALE_DAYS ?? 14)

// One self-guarding entry point: called at boot and (throttled) on the low-frequency resume read, never
// on the hot turn path. The throttle keeps the read-path call effectively free.
const THROTTLE_MS = 6 * 60 * 60 * 1000
let lastRun = 0

export function purgeIntakeSessions(force = false): void {
  if (!force && Date.now() - lastRun < THROTTLE_MS) return
  lastRun = Date.now()
  // Same TTL idiom as markStaleFeatures: datetime() normalises the ISO-8601 updated_at for comparison.
  run(`DELETE FROM intake_session WHERE committed = 1 AND datetime(updated_at) < datetime('now', ?)`, `-${COMMITTED_DAYS} days`)
  run(`DELETE FROM intake_session WHERE committed = 0 AND datetime(updated_at) < datetime('now', ?)`, `-${STALE_DAYS} days`)
}
