import { get, run } from '~~/server/db/client'
import { ensureSchema } from '~~/server/db/schema'
import { logBettingEvent } from '~~/server/db/betting'

// Soft delete: keep the table, flip status to 'deleted', remember the prior status for restore.
export default defineEventHandler(async (event) => {
  ensureSchema()
  const { user } = await requireUserSession(event)
  const actor = (user?.name as string) || 'inconnu'
  const id = getRouterParam(event, 'id')!
  const t = get<{ status: string }>('SELECT status FROM betting_tables WHERE id = ?', id)
  if (!t) throw createError({ statusCode: 404, statusMessage: 'Betting table not found' })
  if (t.status === 'deleted') return { ok: true, status: 'deleted' }

  run('UPDATE betting_tables SET prev_status = status, status = \'deleted\' WHERE id = ?', id)
  logBettingEvent(id, actor, 'deleted', `${actor} a supprimé la table`)
  return { ok: true, status: 'deleted' }
})
