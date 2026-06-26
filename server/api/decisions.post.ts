import { get, tx } from '~~/server/db/client'
import { ensureSchema } from '~~/server/db/schema'
import { recordDecision } from '~~/server/domain/bet'
import type { Verdict } from '~~/server/domain/types'

const VERDICTS: Verdict[] = ['bet', 'pass', 'defer']

// Betting-table action. The bet is human; rationale is mandatory (the "why" is persisted).
export default defineEventHandler(async (event) => {
  ensureSchema()
  const body = await readBody(event)

  const featureId = typeof body?.feature_id === 'string' ? body.feature_id : ''
  const verdict = body?.verdict as Verdict
  const rationale = typeof body?.rationale === 'string' ? body.rationale.trim() : ''
  const hillId = typeof body?.hill_id === 'string' ? body.hill_id : null
  const appetite = body?.appetite === 'big' ? 'big' : body?.appetite === 'small' ? 'small' : null
  // Decider comes from the authenticated session, never the request body.
  const { user } = await requireUserSession(event)
  const decidedBy = user.name as string

  if (!featureId) throw createError({ statusCode: 400, statusMessage: 'feature_id is required' })
  if (!VERDICTS.includes(verdict)) throw createError({ statusCode: 400, statusMessage: 'verdict must be bet | pass | defer' })
  if (!rationale) throw createError({ statusCode: 400, statusMessage: 'rationale is required (the "why" is mandatory)' })
  if (verdict === 'bet' && !hillId) throw createError({ statusCode: 400, statusMessage: 'hill_id is required to bet' })

  const feature = get<{ id: string, status: string }>('SELECT id, status FROM features WHERE id = ?', featureId)
  if (!feature) throw createError({ statusCode: 404, statusMessage: 'Feature not found' })
  // Never reopen a shipped/archived solution — a new need must be shaped as a new feature.
  if (feature.status === 'done' || feature.status === 'archived') {
    throw createError({ statusCode: 409, statusMessage: `Feature ${feature.status} — pas de réouverture ; shapez une nouvelle itération via l'intake.` })
  }

  const id = tx(() => recordDecision({ featureId, verdict, hillId, rationale, decidedBy, appetite }))

  return { id, feature_id: featureId, verdict }
})
