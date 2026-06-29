import { listUsers } from '~~/server/db/users'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  return listUsers()
})
