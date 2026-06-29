import { setUserDisabled } from '~~/server/db/users'

// Owner: remove a member (soft-disable — keeps their id/name so attribution stays intact).
export default defineEventHandler(async (event) => {
  const owner = await requireOwner(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id requis' })
  if (id === owner.id) throw createError({ statusCode: 400, statusMessage: 'Vous ne pouvez pas vous retirer vous-même' })
  const res = setUserDisabled(id, true)
  if ('error' in res) throw createError({ statusCode: 400, statusMessage: res.error })
  return { ok: true }
})
