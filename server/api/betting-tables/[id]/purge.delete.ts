import { get } from '~~/server/db/client'
import { hardDeleteBettingTable } from '~~/server/db/softDelete'

// Permanent, irreversible delete — physically removes the betting table and its candidates, votes and
// events. Guarded: only allowed once the table is already in the trash (status 'deleted').
export default defineAuthedHandler((event) => {
  const id = getRouterParam(event, 'id')!
  const row = get<{ status: string }>('SELECT status FROM betting_tables WHERE id = ?', id)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Betting table not found' })
  if (row.status !== 'deleted') throw createError({ statusCode: 400, statusMessage: 'Supprime la table (corbeille) avant de la purger' })
  hardDeleteBettingTable(id)
  return { ok: true }
})
