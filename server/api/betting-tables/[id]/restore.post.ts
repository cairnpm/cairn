import { get, run } from '~~/server/db/client'
import { ensureSchema } from '~~/server/db/schema'
import { logBettingEvent } from '~~/server/db/betting'

// Reactivate a soft-deleted betting table → restore its prior status.
export default defineEventHandler(async (event) => {
  ensureSchema()
  const { user } = await requireUserSession(event)
  const actor = (user?.name as string) || 'inconnu'
  const id = getRouterParam(event, 'id')!
  const t = get<{ status: string, prev_status: string | null }>('SELECT status, prev_status FROM betting_tables WHERE id = ?', id)
  if (!t) throw createError({ statusCode: 404, statusMessage: 'Betting table not found' })
  if (t.status !== 'deleted') return { ok: true, status: t.status }

  const restored = t.prev_status || 'open'
  run('UPDATE betting_tables SET status = ?, prev_status = NULL WHERE id = ?', restored, id)
  logBettingEvent(id, actor, 'restored', `${actor} a réactivé la table`)
  return { ok: true, status: restored }
})
