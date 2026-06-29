import { getBettingTable, tableCandidates, tableEvents } from '~~/server/db/betting'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')!
  const table = getBettingTable(id)
  if (!table) throw createError({ statusCode: 404, statusMessage: 'Betting table not found' })
  return { table, candidates: tableCandidates(id), events: tableEvents(id) }
})
