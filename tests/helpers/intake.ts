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

/** A generic reply that hands the agent enough to converge (real problem + appetite + a no-go). */
export const SHAPING_ANSWER
  = "Oui : c'est concret et ça casse aujourd'hui pour les utilisateurs, ça compte maintenant. "
  + "Appétit : small (quelques jours). Hors-périmètre : rien de plus pour l'instant. Tu peux proposer."

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
