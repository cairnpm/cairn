import { all } from '~~/server/db/client'
import { markStaleFeatures } from '~~/server/db/stale'
import { assigneesByRole } from '~~/server/db/assignees'

interface FeatureRow {
  id: string; title: string; problem: string; appetite: string | null
  status: string; stale: number; hill_id: string | null; hill_name: string | null
  signal_count: number; created_at: string; updated_at: string
}

// Read-only backlog. Mutations happen only through the gateway (intake/decisions).
export default defineEventHandler((event) => {
  markStaleFeatures() // lazy anti-backlog: flag shaped features not bet on within N days
  const status = getQuery(event).status
  const where = typeof status === 'string' && status !== 'all' ? 'WHERE f.status = ?' : ''
  const args = where ? [status as string] : []

  const rows = all<FeatureRow>(
    `SELECT f.id, f.title, f.problem, f.appetite, f.status, f.stale, f.hill_id,
            h.name AS hill_name, f.signal_count, f.created_at, f.updated_at,
            -- Author = who CREATED the feature, not who touched it last (that would flip on every
            -- refinement). Falls back to the oldest event for rows predating the 'created' event.
            COALESCE(
              (SELECT e.actor FROM feature_events e WHERE e.feature_id = f.id AND e.action = 'created' ORDER BY e.seq LIMIT 1),
              (SELECT e.actor FROM feature_events e WHERE e.feature_id = f.id ORDER BY e.seq LIMIT 1)
            ) AS author
     FROM features f
     LEFT JOIN hills h ON h.id = f.hill_id
     ${where}
     ORDER BY f.stale ASC, f.signal_count DESC, f.updated_at DESC`,
    ...args,
  )

  // Attach assignees per role: shapers drive the avatars column; both feed the backlog's user filter.
  const byRole = (role: 'shaper' | 'builder') => {
    const m = new Map<string, { user_id: string, name: string, avatar_url: string | null }[]>()
    for (const s of assigneesByRole(role)) {
      const list = m.get(s.feature_id) ?? []
      list.push({ user_id: s.user_id, name: s.name, avatar_url: s.avatar_url })
      m.set(s.feature_id, list)
    }
    return m
  }
  const shapers = byRole('shaper')
  const builders = byRole('builder')
  return rows.map(r => ({ ...r, shapers: shapers.get(r.id) ?? [], builders: builders.get(r.id) ?? [] }))
})
