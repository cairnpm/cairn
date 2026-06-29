import { revokeInvitation } from '~~/server/db/invitations'

// Owner: revoke a pending invitation (its link stops working).
export default defineOwnerHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (id) revokeInvitation(id)
  return { ok: true }
})
