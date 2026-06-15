import { get, run, tx } from '~~/server/db/client'
import { ensureSchema } from '~~/server/db/schema'
import type { Verdict } from '~~/server/domain/types'
import { newId } from '~~/server/utils/id'

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
  const decidedBy = typeof body?.decided_by === 'string' ? body.decided_by : null

  if (!featureId) throw createError({ statusCode: 400, statusMessage: 'feature_id is required' })
  if (!VERDICTS.includes(verdict)) throw createError({ statusCode: 400, statusMessage: 'verdict must be bet | pass | defer' })
  if (!rationale) throw createError({ statusCode: 400, statusMessage: 'rationale is required (the "why" is mandatory)' })
  if (verdict === 'bet' && !hillId) throw createError({ statusCode: 400, statusMessage: 'hill_id is required to bet' })

  const feature = get<{ id: string }>('SELECT id FROM features WHERE id = ?', featureId)
  if (!feature) throw createError({ statusCode: 404, statusMessage: 'Feature not found' })

  const id = newId()
  const now = new Date().toISOString()

  tx(() => {
    run(
      `INSERT INTO decisions (id, feature_id, hill_id, verdict, appetite, rationale, decided_by, decided_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id, featureId, verdict === 'bet' ? hillId : hillId, verdict, appetite, rationale, decidedBy, now,
    )
    if (verdict === 'bet') {
      run('UPDATE features SET status = ?, hill_id = ?, stale = 0, updated_at = ? WHERE id = ?', 'bet', hillId, now, featureId)
    }
    // pass / defer: feature stays `shaped` and is a candidate for stale (no auto-carry).
  })

  return { id, feature_id: featureId, verdict, decided_at: now }
})
