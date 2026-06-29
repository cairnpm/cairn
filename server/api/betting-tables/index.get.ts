import { listBettingTables } from '~~/server/db/betting'

export default defineEventHandler(() => {
  return listBettingTables()
})
