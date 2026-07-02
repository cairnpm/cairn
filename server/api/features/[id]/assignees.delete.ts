import { removeAssignee, listAssignees, type AssigneeRole } from '~~/server/db/assignees'
import { getUserById } from '~~/server/db/users'
import { logEvent, listFeatureEvents } from '~~/server/db/events'

// Unassign a member from a feature.
export default defineAuthedHandler(async (event, { actor }) => {
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)
  const userId = typeof body?.user_id === 'string' ? body.user_id : ''
  const role = (body?.role === 'builder' ? 'builder' : 'shaper') as AssigneeRole

  removeAssignee(id, userId, role)
  const member = userId ? getUserById(userId) : undefined
  if (member) logEvent(id, actor, 'unassigned', `${actor} a retiré ${member.name} (${role})`, { user_id: userId, role, name: member.name })
  return { assignees: listAssignees(id), events: listFeatureEvents(id) }
})
