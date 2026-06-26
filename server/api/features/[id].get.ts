import { all, get } from '~~/server/db/client'
import { ensureSchema } from '~~/server/db/schema'

// Read-only feature detail: shape + signals (feedback) + decisions + PR links + routing audit.
export default defineEventHandler((event) => {
  ensureSchema()
  const id = getRouterParam(event, 'id')!

  const feature = get(
    `SELECT f.id, f.title, f.problem, f.appetite, f.solution, f.rabbit_holes, f.out_of_bounds,
            f.status, f.stale, f.hill_id, h.name AS hill_name, f.signal_count, f.created_at, f.updated_at
     FROM features f LEFT JOIN hills h ON h.id = f.hill_id WHERE f.id = ?`,
    id,
  )
  if (!feature) throw createError({ statusCode: 404, statusMessage: 'Feature not found' })

  return {
    feature,
    feedback: all('SELECT id, content, source, classification, created_at FROM feedback WHERE feature_id = ? ORDER BY created_at DESC', id),
    decisions: all('SELECT id, verdict, appetite, rationale, decided_by, hill_id, decided_at FROM decisions WHERE feature_id = ? ORDER BY decided_at DESC', id),
    pr_links: all('SELECT id, repo, pr_number, pr_url, status, auto_close, linked_at, closed_at FROM pr_links WHERE feature_id = ? ORDER BY linked_at DESC', id),
    events: all('SELECT seq, actor, actor_type, action, summary, detail, created_at FROM feature_events WHERE feature_id = ? ORDER BY seq DESC', id),
    routing_log: all('SELECT id, action, confidence, rationale, model, created_at FROM routing_log WHERE target_feature_id = ? ORDER BY created_at DESC', id),
    attachments: all('SELECT id, filename, mime, bytes, kind, created_at FROM attachments WHERE feature_id = ? ORDER BY created_at', id),
  }
})
