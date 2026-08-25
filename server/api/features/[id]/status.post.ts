import { listAssignees } from '~~/server/db/assignees'
import { listFeatureEvents } from '~~/server/db/events'
import { moveFeatureStatus, type AdvanceError } from '~~/server/domain/execution'
import type { FeatureStatus } from '~~/server/domain/types'

// Move a feature one step along the execution flow (bet ⇄ building → done). Owner OR a member assigned
// to it may report progress. Attribution comes from the session, never the body.
const HTTP: Record<AdvanceError, { statusCode: number; statusMessage: string }> = {
  'not-found': { statusCode: 404, statusMessage: 'Feature introuvable' },
  'not-advanceable': { statusCode: 409, statusMessage: 'Statut non déplaçable (bet ⇄ building → done)' },
  'wrong-step': { statusCode: 409, statusMessage: 'Le statut a changé entre-temps — rechargez la page' },
}

export default defineAuthedHandler(async (event, { user, actor }) => {
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)
  const from = typeof body?.from === 'string' ? body.from as FeatureStatus : null
  const direction = body?.direction === 'back' ? 'back' : 'forward'
  if (!from) throw createError({ statusCode: 400, statusMessage: 'from requis' })

  const allowed = user.role === 'owner' || listAssignees(id).some(a => a.user_id === user.id)
  if (!allowed) throw createError({ statusCode: 403, statusMessage: 'Réservé à l\'owner ou à un membre assigné à cette feature' })

  const result = moveFeatureStatus(id, from, direction, actor)
  if (!result.ok) throw createError(HTTP[result.error])

  return { ok: true, status: result.status, events: listFeatureEvents(id) }
})
