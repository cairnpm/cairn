import { changePassword } from '~~/server/db/users'

// Change the current user's password (requires the current one). scrypt verify + rehash.
export default defineAuthedHandler(async (event, { user }) => {
  const body = await readBody(event)
  const current = typeof body?.current === 'string' ? body.current : ''
  const next = typeof body?.next === 'string' ? body.next : ''
  const res = changePassword(user.id, current, next)
  if ('error' in res) throw createError({ statusCode: 400, statusMessage: res.error })
  return { ok: true }
})
