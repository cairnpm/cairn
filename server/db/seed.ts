import { get, run, tx } from './client'
import { logEvent } from './events'
import { encodeEmbedding, localEmbed } from '../utils/embedding'

const emb = (s: string) => encodeEmbedding(localEmbed(s))

interface SeedFeature {
  id: string; title: string; problem: string; appetite: 'small' | 'big'
  solution: string; rabbit_holes: string; out_of_bounds: string
  status: string; hill?: string; signal: number; feedback: { content: string; source: string; classification: string }[]
  decision?: { verdict: string; rationale: string; by: string }
  pr?: { repo: string; number: number; status: string }
}

const HILLS = [
  { id: 'hill-10', name: 'Hill #10 — Performance', starts: '2026-05-19', ends: '2026-06-02', status: 'closed' },
  { id: 'hill-11', name: 'Hill #11 — Fondations', starts: '2026-06-02', ends: '2026-06-16', status: 'closed' },
  { id: 'hill-12', name: 'Hill #12 — Équipe & Collaboration', starts: '2026-06-18', ends: '2026-07-01', status: 'active' },
  { id: 'hill-13', name: 'Hill #13 — Mobile First', starts: '2026-07-04', ends: '2026-07-18', status: 'planned' },
]

const FEATURES: SeedFeature[] = [
  {
    id: 'feat-slack', title: 'Slack notifications', appetite: 'small', status: 'bet', hill: 'hill-12', signal: 3,
    problem: 'L\'équipe perd ~45min/jour en check-ins. Notifier automatiquement les changements de statut, assignations et créations.',
    solution: 'Webhook Slack côté serveur : push un message formaté dans #produit à chaque changement de statut / assignation / création. Canal configurable par projet.',
    rabbit_holes: 'Rate-limit Slack et retries ; batcher les notifs en cas de rafale pour éviter le bruit.',
    out_of_bounds: 'Pas de slash-commands entrantes ce cycle — notifications sortantes uniquement.',
    feedback: [
      { content: 'On perd un temps fou en réunions de statut, des notifs Slack régleraient ça', source: 'slack', classification: 'explore' },
      { content: 'Besoin de notifications Slack quand un ticket change de statut', source: 'manual', classification: 'explore' },
    ],
    decision: { verdict: 'bet', rationale: 'Réduit les réunions de statut. ROI immédiat sur le daily. Estimé 3 jours.', by: 'CEO' },
    pr: { repo: 'bicycle/app', number: 342, status: 'open' },
  },
  {
    id: 'feat-export-batch', title: 'Export en batch CSV/PDF', appetite: 'small', status: 'bet', hill: 'hill-12', signal: 5,
    problem: 'Exporter plusieurs rapports simultanément. Chaque export manuel prend 10min, demandé par 5 clients premium.',
    solution: 'Sélection multiple dans la liste, job d\'export asynchrone (CSV/PDF), barre de progression et lien de téléchargement final.',
    rabbit_holes: 'Gros volumes = génération longue : streamer/paginer côté worker. Mémoire sur les PDF lourds.',
    out_of_bounds: 'Pas de planification récurrente d\'exports ; formats limités à CSV/PDF.',
    feedback: [
      { content: 'Les clients premium veulent exporter plusieurs rapports d\'un coup', source: 'call', classification: 'directive' },
      { content: 'L\'export PDF un par un est trop lent pour nos gros comptes', source: 'email', classification: 'explore' },
    ],
    decision: { verdict: 'bet', rationale: 'Demandé par 5 clients ce mois. ROI direct et immédiat.', by: 'CEO' },
    pr: { repo: 'bicycle/app', number: 328, status: 'open' },
  },
  {
    id: 'feat-analytics', title: 'Analytics dashboard', appetite: 'small', status: 'bet', hill: 'hill-12', signal: 2,
    problem: 'KPIs produit en temps réel: cycle time, vélocité par hill, taux de complétion. Visibilité pour la levée de fonds.',
    solution: 'Dashboard temps réel : cycle time par feature, vélocité par hill, taux de complétion. Agrégats SQL sur features/decisions.',
    rabbit_holes: 'Définir précisément le cycle time (shaped→done ?). Cohérence si une feature est re-pariée.',
    out_of_bounds: 'Pas d\'export des métriques ni d\'alerting ce cycle.',
    feedback: [{ content: 'J\'ai besoin de chiffres concrets pour la présentation investisseurs', source: 'manual', classification: 'directive' }],
    decision: { verdict: 'bet', rationale: 'Besoin de visibilité pour la prochaine levée en septembre.', by: 'CEO' },
  },
  {
    id: 'feat-sso', title: 'SSO Authentication', appetite: 'big', status: 'shaped', signal: 1,
    problem: 'Authentification enterprise (Okta/Azure AD, SAML 2.0). Bloquant pour 2 prospects enterprise.',
    solution: 'SAML 2.0 via Okta/Azure AD, provisioning auto des utilisateurs, login SP-initiated.',
    rabbit_holes: 'Multiples IdP, mapping des rôles, déprovisioning. Tests inter-IdP coûteux.',
    out_of_bounds: 'Pas de SCIM avancé ni de multi-tenant SSO ce cycle.',
    feedback: [{ content: 'Deux prospects enterprise demandent du SSO Okta avant de signer', source: 'call', classification: 'directive' }],
    decision: { verdict: 'defer', rationale: 'Scope trop large (4 sem.) pour un cycle de 2 sem. Aucun deal actif ne le justifie maintenant.', by: 'CEO' },
  },
  {
    id: 'feat-dark', title: 'Dark mode', appetite: 'small', status: 'shaped', signal: 1,
    problem: 'Interface sombre avec persistance. Demandé régulièrement, confort pour le travail de nuit.',
    solution: 'Thème sombre complet, persistance localStorage + préférence OS, sur tous les composants.',
    rabbit_holes: 'Contraste/accessibilité sur tous les écrans ; images et graphes à adapter.',
    out_of_bounds: 'Pas de thèmes personnalisés par utilisateur.',
    feedback: [{ content: 'Ce serait bien d\'avoir un dark mode', source: 'slack', classification: 'musing' }],
    decision: { verdict: 'pass', rationale: 'Priorité basse vs impact business. Non bloquant.', by: 'CEO + Alex' },
  },
  {
    id: 'feat-export-pdf', title: 'Optimiser performance export PDF', appetite: 'small', status: 'done', hill: 'hill-11', signal: 4,
    problem: 'L\'export PDF prend ~30s. Top plainte utilisateurs, impact NPS direct.',
    solution: 'Génération PDF asynchrone (queue) au lieu de synchrone ; cache des templates rendus.',
    rabbit_holes: 'Cohérence du rendu entre sync/async ; invalidation du cache.',
    out_of_bounds: 'Pas de refonte du format du PDF — uniquement la performance.',
    feedback: [{ content: 'L\'export PDF est beaucoup trop lent, ~30 secondes', source: 'email', classification: 'directive' }],
    decision: { verdict: 'bet', rationale: 'Top plainte utilisateurs depuis 3 semaines. Impact NPS direct.', by: 'CEO' },
    pr: { repo: 'bicycle/app', number: 335, status: 'merged' },
  },
]

/** Seed demo data once, only when the DB is empty. Never mutates an existing DB. */
export function seedIfEmpty(): void {
  const count = get<{ n: number }>('SELECT COUNT(*) AS n FROM features')
  if (count && count.n > 0) return

  const now = new Date().toISOString()
  tx(() => {
    for (const h of HILLS) {
      run(
        'INSERT INTO hills (id, name, starts_at, ends_at, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        h.id, h.name, h.starts, h.ends, h.status, now,
      )
    }

    for (const f of FEATURES) {
      run(
        `INSERT INTO features (id, title, problem, appetite, solution, rabbit_holes, out_of_bounds, status, stale, hill_id, signal_count, embedding, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
        f.id, f.title, f.problem, f.appetite, f.solution, f.rabbit_holes, f.out_of_bounds,
        f.status, f.hill ?? null, f.signal, emb(`${f.title} ${f.problem} ${f.solution}`), now, now,
      )

      const AUTHORS = ['CEO', 'Alex', 'Sam']
      logEvent(f.id, AUTHORS[0], 'created', `Feature créée par ${AUTHORS[0]}`, { title: f.title })
      f.feedback.forEach((fb, i) => {
        const author = AUTHORS[(i + 1) % AUTHORS.length]
        run(
          `INSERT INTO feedback (id, content, source, captured_by, classification, status, feature_id, content_hash, embedding, created_at)
           VALUES (?, ?, ?, ?, ?, 'routed', ?, ?, ?, ?)`,
          `fb-${f.id}-${i}`, fb.content, fb.source, author, fb.classification, f.id, `seed-${f.id}-${i}`, emb(fb.content), now,
        )
        logEvent(f.id, author, 'signal_added', `Signal rattaché par ${author}`, { content: fb.content })
      })

      if (f.decision) {
        run(
          `INSERT INTO decisions (id, feature_id, hill_id, verdict, appetite, rationale, decided_by, decided_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          `dec-${f.id}`, f.id, f.hill ?? null, f.decision.verdict, f.appetite, f.decision.rationale, f.decision.by, now,
        )
        const vlabel = f.decision.verdict === 'bet' ? 'Parié (bet)' : f.decision.verdict === 'defer' ? 'Reporté (defer)' : 'Écarté (pass)'
        logEvent(f.id, f.decision.by, f.decision.verdict as any, `${vlabel} par ${f.decision.by}`, { rationale: f.decision.rationale })
      }

      if (f.pr) {
        run(
          `INSERT INTO pr_links (id, feature_id, repo, pr_number, pr_url, status, auto_close, linked_at, closed_at)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
          `pr-${f.id}`, f.id, f.pr.repo, f.pr.number, `https://github.com/${f.pr.repo}/pull/${f.pr.number}`,
          f.pr.status, now, f.pr.status === 'merged' ? now : null,
        )
      }
    }
  })
}
