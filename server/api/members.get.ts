import { ensureSchema } from '~~/server/db/schema'
import { listUsers } from '~~/server/db/users'

export default defineEventHandler(async (event) => {
  ensureSchema()
  await requireUserSession(event)
  return listUsers()
})
