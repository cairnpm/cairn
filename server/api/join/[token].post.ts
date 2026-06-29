import { acceptInvitation } from '~~/server/db/invitations'

// Public: accept an invitation — create the member (scrypt) and open their session.
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token') ?? ''
  const body = await readBody(event)
  const name = typeof body?.name === 'string' ? body.name : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  const res = acceptInvitation(token, name, password)
  if ('error' in res) throw createError({ statusCode: 400, statusMessage: res.error })
  const u = res.user
  await setUserSession(event, {
    user: { id: u.id, name: u.name, role: u.role, avatar_bg: u.avatar_bg, avatar_init: u.avatar_init, avatar_url: u.avatar_url },
  })
  return { ok: true }
})
