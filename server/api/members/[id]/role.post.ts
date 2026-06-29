import { setUserRole } from '~~/server/db/users'

// Owner: promote/demote a member (can't demote the last owner).
export default defineEventHandler(async (event) => {
  await requireOwner(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id requis' })
  const body = await readBody(event)
  const role: 'owner' | 'member' = body?.role === 'owner' ? 'owner' : 'member'
  const res = setUserRole(id, role)
  if ('error' in res) throw createError({ statusCode: 400, statusMessage: res.error })
  return { ok: true }
})
