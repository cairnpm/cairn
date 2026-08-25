import { beforeAll, describe, expect, it } from 'vitest'
import { intakeCommit } from '../server/gateway/intake'
import { ensureSchema } from '../server/db/schema'
import { computeMenu } from '../server/domain/betting'
import { ACTOR, converse, feature, REAL } from './helpers/intake'

// Maturity is where the intake decides whether captured work can ever be bet on: `shaping` is
// excluded from the betting table by design (server/domain/status.ts), so mis-classifying a bettable
// signal removes it from the roadmap silently. See #11.
//
// The three outcomes are COUPLED — narrowing one pushes signals into the others — so they are
// measured together here rather than one assertion per suite. A fix that moves `shaping` toward
// `shaped` while dropping real signals into `discard` is worse than the bug.
//
// REAL only: this measures model judgment, which the deterministic stub cannot represent.
// Set MATURITY_REPS>1 when tuning the prompt, to see a rate instead of a single draw.

const REPS = Number(process.env.MATURITY_REPS ?? 1)

type Outcome = 'shaped' | 'shaping' | 'discard'

/** Signals spanning the whole decision surface, not just the pole that is currently broken. */
const CASES: { name: string, raw: string, want: Outcome, why: string }[] = [
  {
    name: 'named integration with a business driver', want: 'shaped',
    raw: 'Les clients enterprise réclament le SSO via Okta/SAML 2.0 ; deux deals sont bloqués dessus.',
    why: 'bounded problem, standard solution to sketch, quantified pressure — the textbook bet candidate',
  },
  {
    name: 'concrete reported bug', want: 'shaped',
    raw: 'Le filtre par département ne retient pas la sélection quand on change de page dans la liste des candidats.',
    why: 'a bug is a shapeable problem; the problem IS the defect',
  },
  {
    name: 'unresolved strategic choice', want: 'shaping',
    raw: "Modèle agence ou modèle outil ? La décision n'est pas encore tranchée, c'est en cours de réévaluation par l'équipe.",
    why: 'the team has an open choice — the PROBLEM itself is undecided',
  },
  {
    name: 'embryonic, no identified problem', want: 'shaping',
    raw: "Il faudrait peut-être revoir l'onboarding, on ne sait pas encore ce qui coince ni par quel bout le prendre.",
    why: 'nothing to bound yet; capturing it must not mean shaping it',
  },
  {
    name: 'off-product noise', want: 'discard',
    raw: 'salut, test test — quelqu\'un peut me dire où on va manger ce midi ?',
    why: 'the guard against over-capturing: not every message is a signal',
  },
]

/** Drive one case through the real gateway and report what the product actually recorded. */
async function outcomeFor(raw: string): Promise<Outcome> {
  const res = await converse(raw)
  if (!res.proposal || res.proposal.action === 'discard') return 'discard'
  const commit = await intakeCommit(res.session_id, ACTOR)
  if (!commit.feature_id) return 'discard'
  return feature(commit.feature_id).status === 'shaping' ? 'shaping' : 'shaped'
}

describe.runIf(REAL)('intake maturity — the shaped / shaping / discard boundary', () => {
  beforeAll(() => ensureSchema())

  for (const c of CASES) {
    it(`${c.want}: ${c.name}`, async () => {
      const got: Outcome[] = []
      for (let i = 0; i < REPS; i++) got.push(await outcomeFor(c.raw))
      const hits = got.filter(g => g === c.want).length
      expect(hits, `${c.why} — got ${got.join(', ')}`).toBe(REPS)
    }, 180_000 * REPS)
  }

  it('a shaped feature is actually bettable — the whole point of the distinction', async () => {
    const res = await converse(CASES[0]!.raw)
    const commit = await intakeCommit(res.session_id, ACTOR)
    const f = feature(commit.feature_id!)
    expect(f.status, 'a bounded signal must be shaped').toBe('shaped')
    expect(computeMenu().map(c => c.feature_id), 'and must reach the betting table').toContain(f.id)
  }, 180_000)
})
