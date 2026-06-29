import { revokeInvitation } from '~~/server/db/invitations'

// Owner: revoke a pending invitation (its link stops working).
export default defineEventHandler(async (event) => {
  await requireOwner(event)
  const id = getRouterParam(event, 'id')
  if (id) revokeInvitation(id)
  return { ok: true }
})
