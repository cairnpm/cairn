import { ensureSchema } from '~~/server/db/schema'
import { updateUserProfile } from '~~/server/db/users'

// Update the current user's profile and refresh the session so the UI reflects it.
export default defineEventHandler(async (event) => {
  ensureSchema()
  const { user } = await requireUserSession(event)
  const body = await readBody(event)
  const updated = updateUserProfile(user.id, {
    name: typeof body?.name === 'string' ? body.name : undefined,
    email: typeof body?.email === 'string' ? body.email : undefined,
    avatar_url: typeof body?.avatar_url === 'string' ? body.avatar_url : undefined,
  })
  if (!updated) throw createError({ statusCode: 404, statusMessage: 'User not found' })

  await setUserSession(event, {
    user: { id: updated.id, name: updated.name, role: updated.role, avatar_bg: updated.avatar_bg, avatar_init: updated.avatar_init, avatar_url: updated.avatar_url },
  })
  return { ok: true, user: updated }
})
