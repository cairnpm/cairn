import { get, run, tx } from '~~/server/db/client'
import { ensureSchema } from '~~/server/db/schema'

// Delete a betting table (its candidates, votes and events). Any hill/bets it already produced
// are separate records and are kept.
export default defineEventHandler(async (event) => {
  ensureSchema()
  await requireUserSession(event)
  const id = getRouterParam(event, 'id')!
  const t = get<{ id: string }>('SELECT id FROM betting_tables WHERE id = ?', id)
  if (!t) throw createError({ statusCode: 404, statusMessage: 'Betting table not found' })

  tx(() => {
    run('DELETE FROM betting_votes WHERE table_id = ?', id)
    run('DELETE FROM betting_candidates WHERE table_id = ?', id)
    run('DELETE FROM betting_events WHERE table_id = ?', id)
    run('DELETE FROM betting_tables WHERE id = ?', id)
  })
  return { ok: true }
})
