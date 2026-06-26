import { get, run, tx } from '~~/server/db/client'
import { ensureSchema } from '~~/server/db/schema'

// Hard-delete a feature and everything that references it (single writer, in a tx).
export default defineEventHandler(async (event) => {
  ensureSchema()
  await requireUserSession(event)
  const id = getRouterParam(event, 'id')!
  const f = get<{ id: string }>('SELECT id FROM features WHERE id = ?', id)
  if (!f) throw createError({ statusCode: 404, statusMessage: 'Feature not found' })

  tx(() => {
    run('DELETE FROM betting_votes WHERE candidate_id IN (SELECT id FROM betting_candidates WHERE feature_id = ?)', id)
    run('DELETE FROM betting_candidates WHERE feature_id = ?', id)
    run('DELETE FROM routing_log WHERE target_feature_id = ? OR feedback_id IN (SELECT id FROM feedback WHERE feature_id = ?)', id, id)
    run('DELETE FROM feature_events WHERE feature_id = ?', id)
    run('DELETE FROM decisions WHERE feature_id = ?', id)
    run('DELETE FROM pr_links WHERE feature_id = ?', id)
    run('DELETE FROM attachments WHERE feature_id = ?', id)
    run('DELETE FROM feedback WHERE feature_id = ?', id)
    run('UPDATE features SET supersedes_id = NULL WHERE supersedes_id = ?', id)
    run('DELETE FROM features WHERE id = ?', id)
  })
  return { ok: true }
})
