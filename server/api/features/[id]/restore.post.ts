import { FEATURE_SOFT_DELETE, softRestore } from '~~/server/db/softDelete'

// Reactivate a soft-deleted feature → restore its prior status.
export default defineAuthedHandler(async (event, { actor }) => {
  const id = getRouterParam(event, 'id')!
  const res = softRestore(FEATURE_SOFT_DELETE, id, actor)
  if (!res) throw createError({ statusCode: 404, statusMessage: 'Feature not found' })
  return { ok: true, status: res.status }
})
