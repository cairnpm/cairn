import { getUserById } from '~~/server/db/users'

// Current user's profile (name, email, role, avatar).
export default defineAuthedHandler(async (event, { user }) => {
  const profile = getUserById(user.id)
  if (!profile) throw createError({ statusCode: 404, statusMessage: 'User not found' })
  return profile
})
