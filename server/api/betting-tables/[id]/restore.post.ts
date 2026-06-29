import { ensureSchema } from '~~/server/db/schema'
import { BETTING_SOFT_DELETE, softRestore } from '~~/server/db/softDelete'

// Reactivate a soft-deleted betting table → restore its prior status.
export default defineEventHandler(async (event) => {
  ensureSchema()
  const { user } = await requireUserSession(event)
  const actor = (user?.name as string) || 'inconnu'
  const id = getRouterParam(event, 'id')!
  const res = softRestore(BETTING_SOFT_DELETE, id, actor)
  if (!res) throw createError({ statusCode: 404, statusMessage: 'Betting table not found' })
  return { ok: true, status: res.status }
})
