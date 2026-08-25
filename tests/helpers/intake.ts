// Shared fixtures for the end-to-end intake suites. Both tests/intake.test.ts and
// tests/maturity.test.ts drive the product through the REAL gateway (no HTTP), so the way a
// conversation is opened and answered has to be identical between them — otherwise the two suites
// measure different things while appearing to measure the same one.

import { intakeTurn } from '../../server/gateway/intake'
import { get } from '../../server/db/client'
import type { TurnResponse } from '../../server/domain/types'

export const ACTOR = 'Tester'

/** Assertions that depend on real model judgment run only against the API, never the stub. */
export const REAL = !!process.env.ANTHROPIC_API_KEY

/**
 * A generic reply that hands the agent enough to converge (real problem + appetite + a no-go).
 *
 * It must NOT assert a specific appetite. A fixed "small (quelques jours)" contradicts the agent on
 * any substantial signal — it correctly refuses to shape a pitch whose appetite it believes is wrong,
 * says so, and re-asks until the clarify cap forces a `shaping` proposal. That reads as an agent bug
 * and is a fixture bug: the same signal shapes cleanly once the appetite is left to the agent's
 * judgment. Delegating it keeps this answer usable for every case in every suite.
 */
export const SHAPING_ANSWER
  = "Oui : c'est concret et ça casse aujourd'hui pour les utilisateurs, ça compte maintenant. "
  + "Pour l'appétit, juge toi-même d'après le périmètre, et prends les hypothèses raisonnables en "
  + "les notant en rabbit holes. Hors-périmètre : rien de plus pour l'instant. Tu peux proposer."

export function featureCount(): number {
  return get<{ n: number }>('SELECT COUNT(*) AS n FROM features')!.n
}

export function feature(id: string) {
  return get<{ id: string, title: string, status: string, signal_count: number }>(
    'SELECT * FROM features WHERE id = ?', id)!
}

/** Open a session and answer clarifying questions until the agent proposes (or answers a query). */
export async function converse(message: string, maxTurns = 10): Promise<TurnResponse> {
  let res = await intakeTurn(null, message, 'manual', ACTOR)
  let i = 0
  while (res.state === 'clarify' && i++ < maxTurns) {
    res = await intakeTurn(res.session_id, SHAPING_ANSWER, 'manual', ACTOR)
  }
  return res
}
