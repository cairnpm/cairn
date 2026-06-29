import { all, get } from '~~/server/db/client'
import { listAssignees } from '~~/server/db/assignees'
import { listFeatureEvents } from '~~/server/db/events'

// Read-only feature detail: shape + signals (feedback) + decisions + PR links + routing audit.
export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')!

  const feature = get(
    `SELECT f.id, f.title, f.problem, f.appetite, f.solution, f.rabbit_holes, f.out_of_bounds,
            f.status, f.stale, f.hill_id, h.name AS hill_name, f.signal_count, f.created_at, f.updated_at
     FROM features f LEFT JOIN hills h ON h.id = f.hill_id WHERE f.id = ?`,
    id,
  )
  if (!feature) throw createError({ statusCode: 404, statusMessage: 'Feature not found' })

  // Attachments are linked to the SIGNAL (feedback) that introduced them — show them inline there.
  const attachments = all<{ id: string, filename: string, mime: string, bytes: number, kind: string, feedback_id: string | null, created_at: string }>(
    'SELECT id, filename, mime, bytes, kind, feedback_id, created_at FROM attachments WHERE feature_id = ? ORDER BY created_at', id,
  )
  const feedback = all<{ id: string, content: string, source: string, classification: string, captured_by: string | null, created_at: string }>(
    'SELECT id, content, source, classification, captured_by, created_at FROM feedback WHERE feature_id = ? ORDER BY created_at DESC', id,
  ).map(f => ({ ...f, attachments: attachments.filter(a => a.feedback_id === f.id) }))

  return {
    feature,
    feedback,
    decisions: all('SELECT id, verdict, appetite, rationale, decided_by, hill_id, decided_at FROM decisions WHERE feature_id = ? ORDER BY decided_at DESC', id),
    pr_links: all('SELECT id, repo, pr_number, pr_url, status, auto_close, linked_at, closed_at FROM pr_links WHERE feature_id = ? ORDER BY linked_at DESC', id),
    events: listFeatureEvents(id),
    routing_log: all('SELECT id, action, confidence, rationale, model, created_at FROM routing_log WHERE target_feature_id = ? ORDER BY created_at DESC', id),
    // Only feature-level orphans (not tied to a specific signal) remain in the standalone block.
    attachments: attachments.filter(a => !a.feedback_id),
    assignees: listAssignees(id),
  }
})
