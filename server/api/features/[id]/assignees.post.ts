import { get } from '~~/server/db/client'
import { addAssignee, listAssignees, type AssigneeRole } from '~~/server/db/assignees'
import { getUserById } from '~~/server/db/users'
import { logEvent, listFeatureEvents } from '~~/server/db/events'

const ROLE_LABEL: Record<AssigneeRole, string> = { shaper: 'shaper', builder: 'builder' }

// Assign a member (shaper | builder) to a feature. Manual, member-driven — never the intake agent.
export default defineAuthedHandler(async (event, { actor }) => {
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)
  const userId = typeof body?.user_id === 'string' ? body.user_id : ''
  const role = (body?.role === 'builder' ? 'builder' : 'shaper') as AssigneeRole

  if (!get('SELECT id FROM features WHERE id = ?', id)) throw createError({ statusCode: 404, statusMessage: 'Feature not found' })
  const member = userId ? getUserById(userId) : undefined
  if (!member) throw createError({ statusCode: 400, statusMessage: 'Unknown member' })

  addAssignee(id, userId, role, actor)
  logEvent(id, actor, 'assigned', `${actor} a ajouté ${member.name} comme ${ROLE_LABEL[role]}`, { user_id: userId, role, name: member.name })
  return { assignees: listAssignees(id), events: listFeatureEvents(id) }
})
