import { getValidInvitation } from '~~/server/db/invitations'
import { getSetting } from '~~/server/db/settings'

// Public: validate an invitation token and return what the join page needs to render.
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token') ?? ''
  const inv = getValidInvitation(token)
  if (!inv) throw createError({ statusCode: 404, statusMessage: 'Invitation invalide ou expirée' })
  return { email: inv.email, role: inv.role, workspace: getSetting('workspace_name') || 'le workspace' }
})
