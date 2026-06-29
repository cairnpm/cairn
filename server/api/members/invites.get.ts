import { listPendingInvitations } from '~~/server/db/invitations'

// Owner: the pending (unaccepted, non-expired) invitations.
export default defineEventHandler(async (event) => {
  await requireOwner(event)
  return listPendingInvitations()
})
