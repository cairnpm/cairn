import { all } from '~~/server/db/client'
import { ensureSchema } from '~~/server/db/schema'
import { markStaleFeatures } from '~~/server/db/stale'

interface FeatureRow {
  id: string; title: string; problem: string; appetite: string | null
  status: string; stale: number; hill_id: string | null; hill_name: string | null
  signal_count: number; created_at: string; updated_at: string
}

// Read-only backlog. Mutations happen only through the gateway (intake/decisions).
export default defineEventHandler((event) => {
  ensureSchema()
  markStaleFeatures() // lazy anti-backlog: flag shaped features not bet on within N days
  const status = getQuery(event).status
  const where = typeof status === 'string' && status !== 'all' ? 'WHERE f.status = ?' : ''
  const args = where ? [status as string] : []

  return all<FeatureRow>(
    `SELECT f.id, f.title, f.problem, f.appetite, f.status, f.stale, f.hill_id,
            h.name AS hill_name, f.signal_count, f.created_at, f.updated_at,
            (SELECT e.actor FROM feature_events e WHERE e.feature_id = f.id ORDER BY e.seq DESC LIMIT 1) AS last_actor
     FROM features f
     LEFT JOIN hills h ON h.id = f.hill_id
     ${where}
     ORDER BY f.stale ASC, f.signal_count DESC, f.updated_at DESC`,
    ...args,
  )
})
