import { get, run } from '~~/server/db/client'
import { ensureSchema } from '~~/server/db/schema'
import { logEvent } from '~~/server/db/events'

// Reactivate a soft-deleted feature → restore its prior status.
export default defineEventHandler(async (event) => {
  ensureSchema()
  const { user } = await requireUserSession(event)
  const actor = (user?.name as string) || 'inconnu'
  const id = getRouterParam(event, 'id')!
  const f = get<{ status: string, prev_status: string | null }>('SELECT status, prev_status FROM features WHERE id = ?', id)
  if (!f) throw createError({ statusCode: 404, statusMessage: 'Feature not found' })
  if (f.status !== 'deleted') return { ok: true, status: f.status }

  const restored = f.prev_status || 'shaped'
  run('UPDATE features SET status = ?, prev_status = NULL, updated_at = ? WHERE id = ?', restored, new Date().toISOString(), id)
  logEvent(id, actor, 'restored', `${actor} a réactivé la feature`)
  return { ok: true, status: restored }
})
