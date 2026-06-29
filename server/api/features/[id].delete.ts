import { ensureSchema } from '~~/server/db/schema'
import { FEATURE_SOFT_DELETE, softDelete } from '~~/server/db/softDelete'

// Soft delete: keep the row, flip status to 'deleted', remember the prior status so it can be
// restored. Nothing is removed from the DB.
export default defineEventHandler(async (event) => {
  ensureSchema()
  const { user } = await requireUserSession(event)
  const actor = (user?.name as string) || 'inconnu'
  const id = getRouterParam(event, 'id')!
  const res = softDelete(FEATURE_SOFT_DELETE, id, actor)
  if (!res) throw createError({ statusCode: 404, statusMessage: 'Feature not found' })
  return { ok: true, status: res.status }
})
