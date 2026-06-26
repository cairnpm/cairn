import { ensureSchema } from '~~/server/db/schema'
import { listBettingTables } from '~~/server/db/betting'

export default defineEventHandler(() => {
  ensureSchema()
  return listBettingTables()
})
