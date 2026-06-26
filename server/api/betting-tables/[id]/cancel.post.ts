import { run, tx } from '~~/server/db/client'
import { ensureSchema } from '~~/server/db/schema'
import { getBettingTable, logBettingEvent } from '~~/server/db/betting'

export default defineEventHandler(async (event) => {
  ensureSchema()
  const { user } = await requireUserSession(event)
  const id = getRouterParam(event, 'id')!
  const table = getBettingTable(id)
  if (!table) throw createError({ statusCode: 404, statusMessage: 'Betting table not found' })
  if (table.status !== 'open') throw createError({ statusCode: 409, statusMessage: 'Table déjà close' })
  if (user.role !== 'owner' && user.name !== table.owner_name) {
    throw createError({ statusCode: 403, statusMessage: 'Seul l\'owner ou le créateur peut annuler' })
  }
  tx(() => {
    run(`UPDATE betting_tables SET status = 'cancelled' WHERE id = ?`, id)
    logBettingEvent(id, user.name, 'cancelled', `Table annulée par ${user.name}`)
  })
  return { ok: true }
})
