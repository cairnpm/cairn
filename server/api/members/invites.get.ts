import { listPendingInvitations } from '~~/server/db/invitations'

// Owner: the pending (unaccepted, non-expired) invitations.
export default defineOwnerHandler(async () => {
  return listPendingInvitations()
})
