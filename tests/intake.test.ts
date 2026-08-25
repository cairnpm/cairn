import { beforeAll, describe, expect, it } from 'vitest'
import { intakeCommit, intakeTurn, getResumableSession } from '../server/gateway/intake'
import { ensureSchema } from '../server/db/schema'
import { all, get, run } from '../server/db/client'
import { getLlm } from '../server/llm/provider'
import { computeMenu } from '../server/domain/betting'
import { purgeIntakeSessions } from '../server/db/purgeIntake'
import { ACTOR, converse, feature, featureCount, REAL, SHAPING_ANSWER } from './helpers/intake'

// End-to-end intake tests. Run REAL (against the Anthropic API, key from .env) by default, or set
// INTAKE_TEST_STUB=1 to run the deterministic offline stub. The whole product flow is exercised
// directly through the gateway (no HTTP): detect intent → clarify → propose → commit.
//
//   pnpm test:intake            # realistic (real LLM)
//   INTAKE_TEST_STUB=1 pnpm test:intake   # deterministic, offline

// Fixtures shared with tests/maturity.test.ts — see tests/helpers/intake.ts.

beforeAll(async () => {
  ensureSchema()
  const llm = await getLlm() // surfaces the provider so a missing key fails loudly here, not mid-test
  expect(llm.name).toBeTruthy()
})

describe('intake gateway — bout en bout', () => {
  it('création : un signal nouveau crée une feature shapée', async () => {
    const before = featureCount()
    const res = await converse('Les clients enterprise réclament le SSO via Okta/SAML 2.0 ; deux deals sont bloqués dessus.')
    expect(res.proposal, 'le tour doit aboutir à une proposition').toBeTruthy()
    expect(res.proposal!.action).toBe('create_feature')

    const commit = await intakeCommit(res.session_id, ACTOR)
    expect(commit.action).toBe('create_feature')
    expect(commit.feature_id).toBeTruthy()
    expect(featureCount()).toBe(before + 1)

    const f = feature(commit.feature_id!)
    expect(f.status).toBe('shaped')
    expect(f.signal_count).toBe(1)
  })

  it('capture (pas discard) : un signal réel mais non-shapeable devient une feature « shaping », non-bettable', async () => {
    // Décision stratégique non tranchée : réel et dans le périmètre, mais aucun pitch shapeable.
    // Avant, l'agent n'avait que discard → perdu. Désormais : capturé en `shaping`.
    const before = featureCount()
    const res = await converse('Modèle agence ou modèle outil ? La décision n\'est pas encore tranchée, c\'est en cours de réévaluation par l\'équipe.')
    expect(res.proposal, 'un tour doit aboutir').toBeTruthy()
    expect(res.proposal!.action, 'un signal réel n\'est jamais écarté').not.toBe('discard')

    const commit = await intakeCommit(res.session_id, ACTOR)
    expect(commit.feature_id, 'le signal doit être capturé, pas jeté').toBeTruthy()
    if (commit.action === 'create_feature') expect(featureCount()).toBe(before + 1)

    const f = feature(commit.feature_id!)
    expect(f.status, 'capturée en shaping, pas shaped').toBe('shaping')
    // Non-bettable : absente du menu de la betting table.
    const menuIds = computeMenu().map(c => c.feature_id)
    expect(menuIds, 'une feature shaping n\'entre jamais dans le menu de paris').not.toContain(f.id)
  })

  it('un bug est capturé (jamais écarté comme « hors-scope » ou renvoyé vers Jira)', async () => {
    // Cas réel : l'agent avait écarté un bug en prétendant qu'il « va dans un ticketing technique ».
    const before = featureCount()
    const res = await converse("Bug : le compteur de la page d'accueil affiche 0 au lieu de ~77K. Les données et la recherche fonctionnent, seul l'affichage du nombre est cassé. C'est notre porte d'entrée pour remonter les bugs.")
    expect(res.proposal, 'un tour doit aboutir').toBeTruthy()
    expect(res.proposal!.action, 'un bug doit être capturé, pas écarté').not.toBe('discard')

    const commit = await intakeCommit(res.session_id, ACTOR)
    expect(commit.feature_id, 'le bug doit donner une feature (création ou rattachement)').toBeTruthy()
    if (commit.action === 'create_feature') expect(featureCount()).toBe(before + 1)
  })

  it('un incident critique est capturé (pas renvoyé vers l\'astreinte / la gestion d\'incident)', async () => {
    const before = featureCount()
    const res = await converse("Incident critique : l'authentification SSO via Okta échoue (erreur SAML « AudienceRestriction »), 200 utilisateurs bloqués depuis ce matin, aucun contournement.")
    expect(res.proposal, 'un tour doit aboutir').toBeTruthy()
    expect(res.proposal!.action, 'un incident doit être capturé, pas écarté/renvoyé ailleurs').not.toBe('discard')

    const commit = await intakeCommit(res.session_id, ACTOR)
    expect(commit.feature_id, 'l\'incident doit donner une feature (création ou rattachement)').toBeTruthy()
    if (commit.action === 'create_feature') expect(featureCount()).toBe(before + 1)
  })

  it.runIf(REAL)('déduplication / amend : un complément enrichit la feature existante (append), pas de doublon', async () => {
    const seed = await converse("Bug : l'export CSV plante quand un nom de colonne contient une virgule — fichiers invalides, 12 tickets cette semaine.")
    const seedCommit = await intakeCommit(seed.session_id, ACTOR)
    const fid = seedCommit.feature_id!
    const countBefore = featureCount()
    const sigBefore = feature(fid).signal_count

    // Un COMPLÉMENT (apporte du neuf) sur le même bug → l'agent doit enrichir la feature, pas créer
    // de doublon (ni l'écarter puisqu'il y a une info nouvelle).
    // Quasi-miroir du seed (fort recouvrement de tokens, pour le seuil du stub) MAIS additif (info
    // nouvelle, pour que le vrai modèle enrichisse au lieu d'écarter).
    const dup = await converse("Bug export CSV : quand un nom de colonne contient une virgule, le fichier CSV généré est invalide. En plus, les valeurs avec un retour à la ligne cassent aussi le fichier — il faut encadrer chaque champ par des guillemets (RFC 4180).")
    expect(dup.proposal!.action, 'un complément doit être rattaché à la feature existante').toBe('append')
    expect(dup.proposal!.target_feature_id).toBe(fid)

    const dupCommit = await intakeCommit(dup.session_id, ACTOR)
    expect(dupCommit.action).toBe('append')
    expect(featureCount(), 'aucune nouvelle feature créée').toBe(countBefore)
    expect(feature(fid).signal_count, 'le signal est compté sur la feature existante').toBe(sigBefore + 1)
  })

  it('merge : fusionner deux features nommées — une absorbée, l\'autre survit', async () => {
    const a = await converse("Les managers perdent du temps en check-ins : notifier l'équipe dans Slack quand un ticket passe d'une colonne à l'autre (assigné, en cours, terminé). Demandé par 3 managers.")
    const ca = await intakeCommit(a.session_id, ACTOR)
    const b = await converse("Les devs ratent les merges de leurs collègues : poster un message dans Slack quand une PR est mergée, avec le lien vers la PR. Plusieurs demandes.")
    const cb = await intakeCommit(b.session_id, ACTOR)
    const aId = ca.feature_id!, bId = cb.feature_id!
    expect(aId, 'A doit être créée').toBeTruthy()
    expect(bId, 'B doit être créée').toBeTruthy()
    expect(aId, 'A et B doivent être deux features distinctes (sinon dédup à la création)').not.toBe(bId)
    const aTitle = feature(aId).title, bTitle = feature(bId).title

    const merge = await converse(`Fusionne « ${aTitle} » et « ${bTitle} » — c'est le même sujet de notifications Slack.`)
    expect(merge.proposal!.action).toBe('merge')

    const mc = await intakeCommit(merge.session_id, ACTOR)
    expect(mc.action).toBe('merge')

    const statuses = [feature(aId).status, feature(bId).status]
    expect(statuses.filter(s => s === 'archived').length, 'exactement une feature archivée').toBe(1)
    const survivorId = feature(aId).status === 'archived' ? bId : aId
    expect(feature(survivorId).status).not.toBe('archived')

    const mergedEvents = all('SELECT action FROM feature_events WHERE feature_id IN (?, ?) AND action = \'merged\'', aId, bId)
    expect(mergedEvents.length, 'un event « merged » est tracé').toBeGreaterThanOrEqual(1)
  })

  it('query : une question répond sans rien écrire (lecture seule)', async () => {
    const before = featureCount()
    const res = await intakeTurn(null, 'Combien de features shaped avons-nous, et quels sont les hills actifs ?', 'manual', ACTOR)
    expect(res.state).toBe('answered')
    expect(res.proposal).toBeNull()
    expect((res.agent_message || '').length).toBeGreaterThan(10)
    expect(featureCount(), 'une query ne crée rien').toBe(before)
  })

  it('règle « fixed scope » : un signal proche d\'une feature DÉJÀ en cycle ne l\'amende pas', async () => {
    const seed = await converse('On veut un tableau de bord analytics produit en temps réel : cycle time, vélocité par hill, taux de complétion. Besoin de visibilité pour la prochaine levée de fonds, demandé par le board.')
    const sc = await intakeCommit(seed.session_id, ACTOR)
    const fid = sc.feature_id!
    run('UPDATE features SET status = ? WHERE id = ?', 'bet', fid) // pari → en cycle, périmètre figé
    const sigBefore = feature(fid).signal_count

    const dup = await converse('Encore une demande de dashboard analytics produit, avec cycle time et vélocité par hill.')
    expect(dup.proposal!.target_feature_id, 'ne doit jamais cibler une feature en cycle').not.toBe(fid)
    expect(feature(fid).signal_count, 'la feature en cycle reste inchangée').toBe(sigBefore)
  })
})

describe('intake scopé sur une feature', () => {
  beforeAll(() => ensureSchema())

  // Helper: seed a `shaping` feature via the normal intake path.
  async function seedShaping(): Promise<string> {
    const seed = await converse('Modèle agence ou modèle outil ? On ne sait pas encore, en cours de réévaluation.')
    const sc = await intakeCommit(seed.session_id, ACTOR)
    expect(feature(sc.feature_id!).status).toBe('shaping')
    return sc.feature_id!
  }

  it('un chat scopé rattache à la feature ciblée (append), sans créer de doublon', async () => {
    const fid = await seedShaping()
    const before = featureCount()

    // A feature-scoped turn: 7th arg pins the target — skips intent detection, goes straight to refine.
    let r = await intakeTurn(null, 'On avance : je précise le cadrage de cette feature.', 'manual', ACTOR, [], 'fr', fid)
    let i = 0
    while (r.state === 'clarify' && i++ < 8) r = await intakeTurn(r.session_id, SHAPING_ANSWER, 'manual', ACTOR)
    expect(r.proposal!.action, 'scopé → rattachement').toBe('append')
    expect(r.proposal!.target_feature_id, 'ciblé sur la feature ouverte').toBe(fid)

    const commit = await intakeCommit(r.session_id, ACTOR)
    expect(commit.action).toBe('append')
    expect(featureCount(), 'aucune nouvelle feature créée').toBe(before)
  })

  it.runIf(REAL)('résoudre les questions ouvertes promeut la feature shaping → shaped', async () => {
    const fid = await seedShaping()
    let r = await intakeTurn(null, 'Décision prise : on part sur le modèle agence, Jemmo opère ses propres comptes. Le problème et le scope sont donc clairs maintenant.', 'manual', ACTOR, [], 'fr', fid)
    let i = 0
    while (r.state === 'clarify' && i++ < 8) r = await intakeTurn(r.session_id, SHAPING_ANSWER, 'manual', ACTOR)
    await intakeCommit(r.session_id, ACTOR)
    const f = feature(fid)
    expect(f.status, 'promue en shaped').toBe('shaped')
    expect(get<{ open_questions: string }>('SELECT open_questions FROM features WHERE id = ?', fid)!.open_questions).toBe('[]')
  })
})

describe('intake — reprise & purge de sessions', () => {
  beforeAll(() => ensureSchema())

  it('reprise : le propriétaire relit le transcript, un autre membre est rejeté', async () => {
    const res = await intakeTurn(null, 'Un signal de test pour vérifier la reprise de session.', 'manual', ACTOR)
    const resumed = getResumableSession(res.session_id, ACTOR)
    expect(resumed.committed, 'session encore ouverte').toBe(false)
    if (!resumed.committed) expect(resumed.transcript.length, 'le transcript est relu').toBeGreaterThan(0)
    // Attribution par nom : un autre membre ne peut pas reprendre le brouillon.
    expect(() => getResumableSession(res.session_id, 'Quelqu\'un d\'autre')).toThrow()
  })

  it('purge : supprime committées >2j et abandonnées >14j, garde les fraîches', () => {
    const old = '2020-01-01T00:00:00.000Z'
    const now = new Date().toISOString()
    const ins = (id: string, committed: number, updated: string) =>
      run('INSERT INTO intake_session (id, state, turns, data, committed, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', id, 'gather', 0, '{}', committed, updated, updated)
    ins('purge-committed-old', 1, old)
    ins('purge-uncommitted-old', 0, old)
    ins('purge-fresh', 0, now)

    purgeIntakeSessions(true) // force: bypass the 6h throttle

    const alive = (id: string) => !!get('SELECT id FROM intake_session WHERE id = ?', id)
    expect(alive('purge-committed-old'), 'committée >2j supprimée').toBe(false)
    expect(alive('purge-uncommitted-old'), 'abandonnée >14j supprimée').toBe(false)
    expect(alive('purge-fresh'), 'session fraîche conservée').toBe(true)
  })
})
