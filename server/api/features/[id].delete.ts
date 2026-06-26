import { get, run } from '~~/server/db/client'
import { ensureSchema } from '~~/server/db/schema'
import { logEvent } from '~~/server/db/events'

// Soft delete: keep the row, flip status to 'deleted', remember the prior status so it can be
// restored. Nothing is removed from the DB.
export default defineEventHandler(async (event) => {
  ensureSchema()
  const { user } = await requireUserSession(event)
  const actor = (user?.name as string) || 'inconnu'
  const id = getRouterParam(event, 'id')!
  const f = get<{ status: string }>('SELECT status FROM features WHERE id = ?', id)
  if (!f) throw createError({ statusCode: 404, statusMessage: 'Feature not found' })
  if (f.status === 'deleted') return { ok: true, status: 'deleted' }

  run('UPDATE features SET prev_status = status, status = \'deleted\', updated_at = ? WHERE id = ?', new Date().toISOString(), id)
  logEvent(id, actor, 'deleted', `${actor} a supprimé la feature`)
  return { ok: true, status: 'deleted' }
})
