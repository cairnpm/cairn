import { get } from '~~/server/db/client'
import { hardDeleteFeature } from '~~/server/db/softDelete'

// Permanent, irreversible delete — physically removes the feature and everything referencing it.
// Guarded: only allowed once the feature is already in the trash (status 'deleted'), so a live feature
// can never be purged by accident. The UI only surfaces this from the "Deleted" tab.
export default defineAuthedHandler((event) => {
  const id = getRouterParam(event, 'id')!
  const row = get<{ status: string }>('SELECT status FROM features WHERE id = ?', id)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Feature not found' })
  if (row.status !== 'deleted') throw createError({ statusCode: 400, statusMessage: 'Supprime la feature (corbeille) avant de la purger' })
  hardDeleteFeature(id)
  return { ok: true }
})
