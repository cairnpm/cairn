import { ensureSchema } from '~~/server/db/schema'
import { seedUsersIfEmpty, findUserByEmail } from '~~/server/db/users'
import { verifyPassword } from '~~/server/utils/password'

export default defineEventHandler(async (event) => {
  ensureSchema()
  seedUsersIfEmpty()
  const body = await readBody(event)
  const email = typeof body?.email === 'string' ? body.email.trim() : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  if (!email || !password) throw createError({ statusCode: 400, statusMessage: 'email et mot de passe requis' })

  const user = findUserByEmail(email)
  if (!user || !verifyPassword(password, user.password_hash)) {
    throw createError({ statusCode: 401, statusMessage: 'Identifiants invalides' })
  }

  await setUserSession(event, {
    user: { id: user.id, name: user.name, role: user.role, avatar_bg: user.avatar_bg, avatar_init: user.avatar_init },
  })
  return { ok: true, user: { name: user.name, role: user.role } }
})
