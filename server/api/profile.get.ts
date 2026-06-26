import { ensureSchema } from '~~/server/db/schema'
import { getUserById } from '~~/server/db/users'

// Current user's profile (name, email, role, avatar).
export default defineEventHandler(async (event) => {
  ensureSchema()
  const { user } = await requireUserSession(event)
  const profile = getUserById(user.id)
  if (!profile) throw createError({ statusCode: 404, statusMessage: 'User not found' })
  return profile
})
