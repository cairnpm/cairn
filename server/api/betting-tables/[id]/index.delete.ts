import { BETTING_SOFT_DELETE, softDelete } from '~~/server/db/softDelete'

// Soft delete: keep the table, flip status to 'deleted', remember the prior status for restore.
export default defineAuthedHandler(async (event, { actor }) => {
  const id = getRouterParam(event, 'id')!
  const res = softDelete(BETTING_SOFT_DELETE, id, actor)
  if (!res) throw createError({ statusCode: 404, statusMessage: 'Betting table not found' })
  return { ok: true, status: res.status }
})
