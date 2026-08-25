import { listFeatureEvents } from '~~/server/db/events'
import { dropFeatureFromCycle, type DropError } from '~~/server/domain/execution'

// Circuit breaker: pull a feature out of its cycle, back into the shaped pool. It undoes a commitment
// the betting table agreed on, so it's owner-only and the rationale is mandatory.
const HTTP: Record<DropError, { statusCode: number; statusMessage: string }> = {
  'not-found': { statusCode: 404, statusMessage: 'Feature introuvable' },
  'not-in-cycle': { statusCode: 409, statusMessage: 'Seule une feature dans un cycle (bet / building) peut être retirée' },
  'no-rationale': { statusCode: 400, statusMessage: 'Un motif est obligatoire' },
}

export default defineAuthedHandler(async (event, { user, actor }) => {
  const id = getRouterParam(event, 'id')!
  if (user.role !== 'owner') throw createError({ statusCode: 403, statusMessage: 'Réservé à l\'owner' })

  const body = await readBody(event)
  const rationale = typeof body?.rationale === 'string' ? body.rationale : ''

  const result = dropFeatureFromCycle(id, rationale, actor)
  if (!result.ok) throw createError(HTTP[result.error])

  return { ok: true, events: listFeatureEvents(id) }
})
