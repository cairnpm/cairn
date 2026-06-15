/**
 * In-memory state + derived data for the Bicycle "Product OS" mockup.
 * Faithful port of the design-composer logic — NO database, nothing persisted.
 */
import { computed } from 'vue'

export type Screen = 'intake' | 'backlog' | 'betting' | 'hills'

export interface ChatMsg { id: number; r: 'user' | 'agent'; text: string }
export interface Ticket {
  id: string; title: string; status: string; effort: string
  priority: string; hill: string; pr: string; owner: string
}

// ── Static reference data (verbatim from the mockup) ───────────────────────
export const TEAM = [
  { name: 'CEO (vous)', init: 'C', bg: '#18181b' },
  { name: 'Alex', init: 'A', bg: '#2563eb' },
  { name: 'Sam', init: 'S', bg: '#16a34a' },
]

const S_MAP: Record<string, [string, string]> = {
  'En cours': ['#fef9c3', '#854d0e'],
  'À faire': ['#eff6ff', '#1d4ed8'],
  'Fait': ['#f0fdf4', '#15803d'],
}
const P_MAP: Record<string, [string, string]> = {
  'Haute': ['#fef2f2', '#dc2626'],
  'Moyenne': ['#fff7ed', '#c2410c'],
  'Basse': ['#f0fdf4', '#15803d'],
}
const I_MAP: Record<string, [string, string]> = {
  'Très haute': ['#fef2f2', '#dc2626'],
  'Haute': ['#fff7ed', '#c2410c'],
  'Moyenne': ['#eff6ff', '#1d4ed8'],
  'Basse': ['#f0fdf4', '#15803d'],
}

const RAW_TICKETS: Ticket[] = [
  { id: '#847', title: 'Optimiser performance export PDF', status: 'En cours', effort: 'M', priority: 'Haute', hill: 'Hill #12', pr: '#342', owner: 'Alex' },
  { id: '#846', title: 'Intégration Slack (notifications)', status: 'À faire', effort: 'L', priority: 'Moyenne', hill: 'Hill #12', pr: '—', owner: 'Alex' },
  { id: '#845', title: 'Dark mode UI', status: 'À faire', effort: 'M', priority: 'Basse', hill: 'Hill #13', pr: '—', owner: 'Sam' },
  { id: '#844', title: 'Authentification SSO', status: 'À faire', effort: 'XL', priority: 'Haute', hill: 'Hill #14', pr: '—', owner: 'TBD' },
  { id: '#843', title: 'Fix: crash export en batch', status: 'Fait', effort: 'S', priority: 'Haute', hill: 'Hill #11', pr: '#330', owner: 'Sam' },
  { id: '#842', title: 'Redesign onboarding', status: 'En cours', effort: 'M', priority: 'Moyenne', hill: 'Hill #12', pr: '#328', owner: 'Alex' },
]

const ACTIVITY_MAP: Record<string, { text: string; time: string; dot: string }[]> = {
  '#847': [
    { text: 'Ticket créé via Intake (CEO)', time: '15 juin, 14:23', dot: '#18181b' },
    { text: 'Assigné à Alex', time: '15 juin, 14:24', dot: '#2563eb' },
    { text: 'Effort: M · Priorité: Haute', time: '15 juin, 14:24', dot: '#a1a1aa' },
    { text: 'Lié à Hill #12 lors de la Betting Table', time: '15 juin, 15:10', dot: '#a1a1aa' },
    { text: 'Alex → statut: En cours', time: '15 juin, 16:30', dot: '#854d0e' },
    { text: 'PR #342 ouvert par Alex', time: '16 juin, 09:45', dot: '#2563eb' },
  ],
  '#846': [
    { text: 'Ticket créé via Intake (CEO)', time: '14 juin, 10:02', dot: '#18181b' },
    { text: 'Assigné à Alex pour Hill #12', time: '14 juin, 10:05', dot: '#2563eb' },
    { text: 'Effort: L · Priorité: Moyenne', time: '14 juin, 10:05', dot: '#a1a1aa' },
  ],
  '#845': [
    { text: 'Ticket créé via Intake (CEO)', time: '10 juin, 11:30', dot: '#18181b' },
    { text: 'Assigné à Hill #13 — faible priorité business', time: '10 juin, 11:32', dot: '#a1a1aa' },
    { text: 'Effort: M · Priorité: Basse', time: '10 juin, 11:32', dot: '#a1a1aa' },
  ],
  '#844': [
    { text: 'Ticket créé via Intake (CEO)', time: '8 juin, 09:00', dot: '#18181b' },
    { text: 'Scope XL — reporté à Hill #14 (deal enterprise requis)', time: '8 juin, 09:05', dot: '#dc2626' },
    { text: 'Effort: XL · Priorité: Haute', time: '8 juin, 09:05', dot: '#a1a1aa' },
  ],
  '#843': [
    { text: 'Bug signalé (prod) — utilisateur premium', time: '2 juin, 08:15', dot: '#dc2626' },
    { text: 'Escaladé Haute priorité par CEO', time: '2 juin, 08:30', dot: '#18181b' },
    { text: 'Assigné à Sam · Effort: S', time: '2 juin, 08:35', dot: '#16a34a' },
    { text: 'Sam → statut: En cours', time: '2 juin, 09:00', dot: '#854d0e' },
    { text: 'PR #330 ouvert par Sam', time: '2 juin, 11:20', dot: '#16a34a' },
    { text: 'PR #330 mergé · statut → Fait', time: '2 juin, 16:45', dot: '#15803d' },
  ],
  '#842': [
    { text: 'Ticket créé via Intake (CEO)', time: '7 juin, 14:00', dot: '#18181b' },
    { text: 'Assigné à Alex pour Hill #12', time: '7 juin, 14:02', dot: '#2563eb' },
    { text: 'Alex → statut: En cours', time: '13 juin, 10:20', dot: '#854d0e' },
    { text: 'PR #328 ouvert par Alex', time: '14 juin, 15:00', dot: '#2563eb' },
  ],
}

interface RichVote { user: string; init: string; bg: string; reason: string }
const CAND_RICH: Record<number, { fullDesc: string; ticketRef: string | null; richVotes: RichVote[] }> = {
  1: { fullDesc: 'Connecter Bicycle à Slack pour envoyer des notifications automatiques lors des changements de statut, assignations et créations de tickets. Supporte #général et canaux dédiés.', ticketRef: '#846', richVotes: [{ user: 'CEO', init: 'C', bg: '#18181b', reason: 'On perd ~45min/jour en check-ins qui pourraient être remplacés par des notifs auto. ROI immédiat sur le daily standup.' }, { user: 'Alex', init: 'A', bg: '#2563eb', reason: 'Implémentation estimée 3 jours. J\'ai déjà fait l\'intégration Slack sur un autre projet — je réutilise le même pattern webhooks.' }] },
  2: { fullDesc: 'Permettre d\'exporter plusieurs rapports simultanément en CSV ou PDF. Inclut la sélection multiple et la progression en temps réel.', ticketRef: '#847', richVotes: [{ user: 'CEO', init: 'C', bg: '#18181b', reason: 'Demandé par 5 clients premium ce mois. Chaque export manuel prend 10min — à 3x/semaine c\'est 2h perdues par client.' }, { user: 'Sam', init: 'S', bg: '#16a34a', reason: 'Petite feature, fort impact. Je peux la livrer en 1 semaine en solo.' }, { user: 'Alex', init: 'A', bg: '#2563eb', reason: 'Je supporte Sam en fin de sprint si blocage back-end.' }] },
  3: { fullDesc: 'Authentification enterprise via Okta, Azure AD ou Google Workspace. Inclut SAML 2.0 et provisioning automatique des utilisateurs.', ticketRef: '#844', richVotes: [{ user: 'CEO', init: 'C', bg: '#18181b', reason: 'Bloquant pour 2 prospects enterprise. Deal potentiel de 40k€/an si on signe dans le prochain mois.' }] },
  4: { fullDesc: 'Interface sombre complète avec persistance de la préférence utilisateur (localStorage + OS preference). Couvre tous les composants.', ticketRef: '#845', richVotes: [{ user: 'Sam', init: 'S', bg: '#16a34a', reason: 'Reçoit des demandes régulièrement. Améliore le confort pour les utilisateurs qui travaillent la nuit.' }] },
  5: { fullDesc: 'Adaptation de l\'interface pour tablette et mobile. Inclut navigation touch-friendly, colonnes responsives et PWA hors-ligne.', ticketRef: null, richVotes: [{ user: 'Alex', init: 'A', bg: '#2563eb', reason: 'L\'usage mobile va croître. Vaut mieux l\'anticiper maintenant avant que l\'app soit trop complexe à adapter.' }] },
  6: { fullDesc: 'Tableau de bord des KPIs produit en temps réel: cycle time, vélocité par hill, taux de complétion. Données exploitables pour les betting tables futures.', ticketRef: null, richVotes: [{ user: 'CEO', init: 'C', bg: '#18181b', reason: 'J\'ai besoin de chiffres concrets pour ma présentation investisseurs. Complétion rate et cycle time sont critiques.' }, { user: 'Sam', init: 'S', bg: '#16a34a', reason: 'Ces métriques vont améliorer la qualité de nos prochaines betting tables.' }] },
}

const CAND_DEFS = [
  { id: 1, title: 'Slack Integration', desc: 'Notifier l\'équipe des changements de statut', effort: 'M · 2w', impact: 'Haute' },
  { id: 2, title: 'Export en batch', desc: 'Exporter plusieurs reports en CSV/PDF', effort: 'S · 1w', impact: 'Moyenne' },
  { id: 3, title: 'SSO Authentication', desc: 'Authentification enterprise Okta/Azure AD', effort: 'XL · 4w', impact: 'Très haute' },
  { id: 4, title: 'Dark mode', desc: 'Interface sombre avec persistance', effort: 'M · 3w', impact: 'Basse' },
  { id: 5, title: 'Mobile responsive', desc: 'Adaptation complète tablette et mobile', effort: 'L · 3w', impact: 'Haute' },
  { id: 6, title: 'Analytics dashboard', desc: 'KPIs produit: cycle time, velocity', effort: 'M · 2w', impact: 'Haute' },
]

const HILLS_OVERVIEW_RAW = [
  { id: 12, name: 'Hill #12 — Équipe & Collaboration', status: 'En cours', sBg: '#fef9c3', sColor: '#854d0e', dates: '18 juin — 1 juil. 2026', pct: '48%', barW: '48%', pColor: '#b45309', hasBar: true, pills: ['Slack notifications', 'Export batch', 'Analytics'] },
  { id: 11, name: 'Hill #11 — Fondations', status: 'Terminé', sBg: '#f0fdf4', sColor: '#15803d', dates: '2 juin — 16 juin 2026', pct: '92%', barW: '92%', pColor: '#16a34a', hasBar: true, pills: ['Export PDF', 'Fix crashs batch', 'Redesign forms', 'API docs'] },
  { id: 10, name: 'Hill #10 — Performance', status: 'Terminé', sBg: '#f0fdf4', sColor: '#15803d', dates: '19 mai — 2 juin 2026', pct: '100%', barW: '100%', pColor: '#16a34a', hasBar: true, pills: ['Caching DB', 'Pagination', 'CDN setup', 'Image optimization'] },
  { id: 13, name: 'Hill #13 — Mobile First', status: 'Planifié', sBg: '#eff6ff', sColor: '#1d4ed8', dates: '4 juil. — 18 juil. 2026', pct: '—', barW: '0%', pColor: '#a1a1aa', hasBar: false, pills: ['Responsive layout', 'Touch gestures', 'PWA cache'] },
]

interface HillFeature { title: string; owner: string; effort: string; progress: number; barW: string; pr: string; votes: RichVote[] }
interface HillDetail {
  name: string; status: string; sBg: string; sColor: string; dates: string; duration: string
  why: string; selected: HillFeature[]; postponed: { title: string; effort: string; reason: string; by: string }[]
}
const HILL_DETAIL_MAP: Record<number, HillDetail> = {
  12: {
    name: 'Hill #12 — Équipe & Collaboration', status: 'En cours', sBg: '#fef9c3', sColor: '#854d0e',
    dates: '18 juin — 1 juillet 2026', duration: '2 semaines',
    why: 'L\'équipe perdait ~2h/jour en réunions de sync et exports manuels. Ces 3 features ciblent exactement les frictions identifiées en rétrospective: communication dispersée, manque de visibilité et reporting chronophage.',
    selected: [
      { title: 'Slack notifications', owner: 'Alex', effort: 'M', progress: 45, barW: '45%', pr: '#342', votes: [{ user: 'CEO', init: 'C', bg: '#18181b', reason: 'Réduit les réunions de statut. ROI immédiat sur le daily.' }, { user: 'Alex', init: 'A', bg: '#2563eb', reason: 'Estimé 3 jours. Faisable dans le cycle, déjà fait sur un projet similaire.' }] },
      { title: 'Export batch CSV/PDF', owner: 'Sam', effort: 'S', progress: 70, barW: '70%', pr: '#328', votes: [{ user: 'CEO', init: 'C', bg: '#18181b', reason: 'Demandé par 5 clients ce mois. ROI direct et immédiat.' }, { user: 'Sam', init: 'S', bg: '#16a34a', reason: 'Petite feature, fort impact. Parfait pour débloquer les clients premium.' }, { user: 'Alex', init: 'A', bg: '#2563eb', reason: 'Je supporte Sam si besoin en fin de sprint.' }] },
      { title: 'Analytics dashboard', owner: 'Alex & Sam', effort: 'M', progress: 30, barW: '30%', pr: '—', votes: [{ user: 'CEO', init: 'C', bg: '#18181b', reason: 'Besoin de visibilité pour la prochaine levée de fonds en septembre.' }, { user: 'Sam', init: 'S', bg: '#16a34a', reason: 'Les données amélioreront nos prochaines betting tables.' }] },
    ],
    postponed: [
      { title: 'SSO Authentication', effort: 'XL', reason: 'Scope trop large (4 semaines) pour un cycle de 2 semaines. Aucun deal enterprise actif ne justifie l\'investissement maintenant.', by: 'CEO' },
      { title: 'Dark mode', effort: 'M', reason: 'Priorité basse vs impact business actuel. Non bloquant pour les clients. Repoussé à une hill moins chargée.', by: 'CEO + Alex' },
      { title: 'Mobile responsive', effort: 'L', reason: 'Usage mobile < 8%. On attend les analytics dashboard pour valider le besoin avant d\'investir 3 semaines.', by: 'CEO' },
    ],
  },
  11: {
    name: 'Hill #11 — Fondations', status: 'Terminé', sBg: '#f0fdf4', sColor: '#15803d',
    dates: '2 juin — 16 juin 2026', duration: '2 semaines',
    why: 'Avant de construire de nouvelles features, on devait consolider les bases: stabilité de l\'export, documentation pour les partenaires et refonte des formulaires pour réduire le support.',
    selected: [
      { title: 'Optimiser export PDF', owner: 'Alex', effort: 'M', progress: 100, barW: '100%', pr: '#335', votes: [{ user: 'CEO', init: 'C', bg: '#18181b', reason: 'Top plainte utilisateurs depuis 3 semaines. Impact NPS direct.' }, { user: 'Alex', init: 'A', bg: '#2563eb', reason: 'Identifié le bottleneck: génération synchrone. Fix propre et rapide.' }] },
      { title: 'Fix crashs export batch', owner: 'Sam', effort: 'S', progress: 100, barW: '100%', pr: '#330', votes: [{ user: 'CEO', init: 'C', bg: '#18181b', reason: 'Bug bloquant pour 3 clients premium. Escalade support en cours.' }, { user: 'Sam', init: 'S', bg: '#16a34a', reason: 'Rapide à fixer. Priorité absolue avant la démo du 5 juin.' }] },
      { title: 'Documentation API', owner: 'Alex', effort: 'S', progress: 100, barW: '100%', pr: '#338', votes: [{ user: 'CEO', init: 'C', bg: '#18181b', reason: '2 intégrations partenaires en cours bloquées faute de docs.' }] },
    ],
    postponed: [
      { title: 'Redesign forms (partiel)', effort: 'M', reason: 'Commencé mais non terminé à 100%. Reporté à Hill #12 pour finalisation propre.', by: 'Sam + CEO' },
    ],
  },
  10: {
    name: 'Hill #10 — Performance', status: 'Terminé', sBg: '#f0fdf4', sColor: '#15803d',
    dates: '19 mai — 2 juin 2026', duration: '2 semaines',
    why: 'Temps de chargement dépassant 8s sur certaines pages. Objectif: passer sous 2s. Impact direct sur rétention et NPS.',
    selected: [
      { title: 'Caching DB (Redis)', owner: 'Alex', effort: 'M', progress: 100, barW: '100%', pr: '#319', votes: [{ user: 'CEO', init: 'C', bg: '#18181b', reason: 'Requêtes DB répétitives explosent avec la croissance utilisateurs.' }, { user: 'Alex', init: 'A', bg: '#2563eb', reason: 'Redis déjà en place. Implémentation rapide, gain x5 sur les queries.' }] },
      { title: 'CDN setup (CloudFront)', owner: 'Sam', effort: 'S', progress: 100, barW: '100%', pr: '#322', votes: [{ user: 'CEO', init: 'C', bg: '#18181b', reason: 'Assets statiques = 40% du temps de chargement actuel.' }, { user: 'Sam', init: 'S', bg: '#16a34a', reason: 'CloudFront déjà configuré sur un autre projet. Journée max.' }] },
    ],
    postponed: [],
  },
  13: {
    name: 'Hill #13 — Mobile First', status: 'Planifié', sBg: '#eff6ff', sColor: '#1d4ed8',
    dates: '4 juillet — 18 juillet 2026', duration: '2 semaines',
    why: 'Betting table pas encore faite. Cette hill sera planifiée en fin de Hill #12, une fois les analytics disponibles pour confirmer le besoin mobile.',
    selected: [], postponed: [],
  },
}

const CHAT_RESPONSES = [
  'Aucun doublon trouvé. Quelle urgence — haute, moyenne ou basse ? Qui peut s\'en occuper dans l\'équipe ?',
  'Noté. J\'estime l\'effort à M et la priorité à Haute. Ticket #{n} créé et ajouté au backlog. Besoin d\'autre chose ?',
  'Attention — je vois une similarité avec le ticket #843 (Fix: crash export). Est-ce le même problème ou un nouveau cas ?',
  'Parfait, ticket ajouté. Je l\'ai rattaché à Hill #12. Alex est disponible selon la capacité actuelle.',
]

export const BETTING_WHY = 'L\'équipe perd du temps en synchronisation. Ces features adressent les pain points directs: notifications auto, exports batch et analytics KPIs. Objectif: −30% overhead réunions de statut.'

// ── Composable ─────────────────────────────────────────────────────────────
const SCREEN_PATH: Record<Screen, string> = {
  intake: '/',
  backlog: '/backlog',
  betting: '/betting',
  hills: '/hills',
}

export function useBicycle() {
  const route = useRoute()
  // Current screen + selected hill are derived from the route (real pages).
  const screen = computed<Screen>(() => {
    const p = route.path
    if (p.startsWith('/backlog')) return 'backlog'
    if (p.startsWith('/betting')) return 'betting'
    if (p.startsWith('/hills')) return 'hills'
    return 'intake'
  })
  const selectedHill = computed<number | null>(() => {
    const m = route.path.match(/^\/hills\/(\d+)/)
    return m ? Number(m[1]) : null
  })

  const input = useState('bike-input', () => '')
  const msgs = useState<ChatMsg[]>('bike-msgs', () => [])
  const sel = useState<number[]>('bike-sel', () => [1, 2, 6])
  const selectedTicketId = useState<string | null>('bike-ticket', () => null)
  const selectedCandidateId = useState<number | null>('bike-cand', () => null)
  const selectedHillFeatureKey = useState<string | null>('bike-hillfeat', () => null)
  const statusFilter = useState<string>('bike-filter', () => 'Tous')
  const view = useState<'table' | 'pipeline'>('bike-view', () => 'table')
  const sortKey = useState<string | null>('bike-sortkey', () => null)
  const sortDir = useState<'asc' | 'desc'>('bike-sortdir', () => 'asc')
  let seq = 1000

  // ── Actions (navigation goes through the router) ──
  function goTo(s: Screen) {
    return navigateTo(SCREEN_PATH[s])
  }
  function send() {
    const text = input.value.trim()
    if (!text) return
    const n = msgs.value.filter(m => m.r === 'user').length
    const t = seq++
    const reply = CHAT_RESPONSES[n % CHAT_RESPONSES.length].replace('{n}', String(848 + n))
    msgs.value = [...msgs.value, { id: t, r: 'user', text }, { id: t + 1, r: 'agent', text: reply }]
    input.value = ''
  }
  function toggleCandidate(id: number) {
    sel.value = sel.value.includes(id) ? sel.value.filter(x => x !== id) : [...sel.value, id]
  }
  function toggleSort(key: string) {
    if (sortKey.value === key) sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
    else { sortKey.value = key; sortDir.value = 'asc' }
  }

  const EFFORT_RANK: Record<string, number> = { S: 0, M: 1, L: 2, XL: 3 }
  const STATUS_RANK: Record<string, number> = { 'À faire': 0, 'En cours': 1, 'Fait': 2 }
  const PRIORITY_RANK: Record<string, number> = { 'Basse': 0, 'Moyenne': 1, 'Haute': 2 }
  function cmp(a: Ticket, b: Ticket, key: string): number {
    switch (key) {
      case 'title': return a.title.localeCompare(b.title)
      case 'id': return Number(a.id.slice(1)) - Number(b.id.slice(1))
      case 'status': return (STATUS_RANK[a.status] ?? 0) - (STATUS_RANK[b.status] ?? 0)
      case 'effort': return (EFFORT_RANK[a.effort] ?? 0) - (EFFORT_RANK[b.effort] ?? 0)
      case 'priority': return (PRIORITY_RANK[a.priority] ?? 0) - (PRIORITY_RANK[b.priority] ?? 0)
      case 'hill': return a.hill.localeCompare(b.hill, undefined, { numeric: true })
      default: return 0
    }
  }

  // ── Derived ──
  const pageMeta = computed(() => {
    const has = selectedHill.value !== null
    return {
      intake: { title: 'Intake Conversationnel', sub: 'Seul point d\'entrée pour modifier le backlog' },
      backlog: { title: 'Backlog Produit', sub: 'Read-only — modifiez via l\'Intake' },
      betting: { title: 'Betting Table', sub: 'Votez les features du prochain cycle' },
      hills: { title: has ? 'Hill #' + selectedHill.value : 'Hills', sub: has ? 'Détail · Décisions & avancement' : 'Cycles passés, en cours et planifiés' },
    }[screen.value]
  })

  const chatMsgs = computed(() => msgs.value.map(m => ({
    ...m,
    isAgent: m.r === 'agent',
    justify: m.r === 'agent' ? 'flex-start' : 'flex-end',
    bg: m.r === 'agent' ? '#f4f4f5' : '#18181b',
    fg: m.r === 'agent' ? '#18181b' : '#ffffff',
    radius: m.r === 'agent' ? '4px 14px 14px 14px' : '14px 4px 14px 14px',
  })))

  const tickets = computed(() => RAW_TICKETS.map(t => ({
    ...t,
    sBg: (S_MAP[t.status] || [])[0] || '#f4f4f5', sColor: (S_MAP[t.status] || [])[1] || '#71717a',
    pBg: (P_MAP[t.priority] || [])[0] || '#f4f4f5', pColor: (P_MAP[t.priority] || [])[1] || '#71717a',
    rowBg: selectedTicketId.value === t.id ? '#f4f4f5' : 'transparent',
  })))

  const visibleTickets = computed(() => {
    let list = tickets.value
    if (statusFilter.value !== 'Tous') list = list.filter(t => t.status === statusFilter.value)
    if (sortKey.value) {
      const dir = sortDir.value === 'asc' ? 1 : -1
      list = [...list].sort((a, b) => cmp(a, b, sortKey.value!) * dir)
    }
    return list
  })

  // Kanban columns (pipeline view) — fixed status order, fed by the same filter/sort.
  const PIPELINE_ORDER = ['À faire', 'En cours', 'Fait']
  const pipeline = computed(() =>
    PIPELINE_ORDER
      .filter(status => statusFilter.value === 'Tous' || statusFilter.value === status)
      .map(status => ({
        status,
        sBg: (S_MAP[status] || [])[0] || '#f4f4f5',
        sColor: (S_MAP[status] || [])[1] || '#71717a',
        items: visibleTickets.value.filter(t => t.status === status),
      })),
  )

  const stats = computed(() => [
    { label: 'Total', count: RAW_TICKETS.length },
    { label: 'En cours', count: RAW_TICKETS.filter(t => t.status === 'En cours').length },
    { label: 'À faire', count: RAW_TICKETS.filter(t => t.status === 'À faire').length },
    { label: 'Fait', count: RAW_TICKETS.filter(t => t.status === 'Fait').length },
  ])

  const filters = computed(() => ['Tous', 'En cours', 'À faire', 'Fait'].map((label, i) => ({
    label, fw: i === 0 ? 500 : 400,
    bg: i === 0 ? '#18181b' : 'white', color: i === 0 ? 'white' : '#71717a', border: i === 0 ? '#18181b' : '#e4e4e7',
  })))

  const ticketDetail = computed(() => {
    const t = RAW_TICKETS.find(x => x.id === selectedTicketId.value)
    if (!t) return null
    return {
      ...t,
      sBg: (S_MAP[t.status] || [])[0] || '#f4f4f5', sColor: (S_MAP[t.status] || [])[1] || '#71717a',
      pBg: (P_MAP[t.priority] || [])[0] || '#f4f4f5', pColor: (P_MAP[t.priority] || [])[1] || '#71717a',
      activity: ACTIVITY_MAP[t.id] || [{ text: 'Ticket créé', time: 'Récemment', dot: '#18181b' }],
    }
  })

  const candidates = computed(() => CAND_DEFS.map(c => {
    const r = CAND_RICH[c.id] || { fullDesc: c.desc, ticketRef: null, richVotes: [] }
    const isVoted = sel.value.includes(c.id)
    return {
      ...c,
      fullDesc: r.fullDesc, ticketRef: r.ticketRef, richVotes: r.richVotes,
      votes: r.richVotes.map(v => ({ name: v.user, init: v.init, bg: v.bg })),
      checked: isVoted,
      border: isVoted ? '2px solid #18181b' : '1px solid #e4e4e7',
      iBg: (I_MAP[c.impact] || [])[0] || '#f4f4f5', iColor: (I_MAP[c.impact] || [])[1] || '#71717a',
      voteLabel: isVoted ? '✓ Vous avez voté' : 'Voter pour cette feature',
      voteBg: isVoted ? '#f0fdf4' : '#18181b',
      voteColor: isVoted ? '#15803d' : 'white',
      voteBorder: '1px solid ' + (isVoted ? '#bbf7d0' : '#18181b'),
    }
  }))

  const candidateDetail = computed(() =>
    selectedCandidateId.value === null ? null : candidates.value.find(c => c.id === selectedCandidateId.value) || null,
  )

  const hillsOverview = computed(() => HILLS_OVERVIEW_RAW)

  const hillDetail = computed(() =>
    selectedHill.value !== null ? HILL_DETAIL_MAP[selectedHill.value] || null : null,
  )

  const hillFeatureDetail = computed(() =>
    !hillDetail.value || selectedHillFeatureKey.value === null
      ? null
      : hillDetail.value.selected.find(f => f.title === selectedHillFeatureKey.value) || null,
  )

  return {
    // state
    screen, input, msgs, sel,
    selectedTicketId, selectedHill, selectedCandidateId, selectedHillFeatureKey,
    // derived
    pageMeta, chatMsgs, tickets, visibleTickets, pipeline, stats, filters, ticketDetail,
    statusFilter, sortKey, sortDir, toggleSort, view,
    setStatusFilter: (v: string) => { statusFilter.value = v },
    setView: (v: 'table' | 'pipeline') => { view.value = v },
    candidates, candidateDetail, hillsOverview, hillDetail, hillFeatureDetail,
    selCount: computed(() => sel.value.length),
    ticketCount: RAW_TICKETS.length,
    team: TEAM,
    bettingWhy: BETTING_WHY,
    // actions
    goTo, send, toggleCandidate,
    goToIntake: () => navigateTo('/'),
    openBetting: () => navigateTo('/betting'),
    selectTicket: (id: string) => { selectedTicketId.value = id },
    clearTicket: () => { selectedTicketId.value = null },
    selectHill: (id: number) => navigateTo(`/hills/${id}`),
    clearHill: () => navigateTo('/hills'),
    openCandidate: (id: number) => { selectedCandidateId.value = id },
    clearCandidate: () => { selectedCandidateId.value = null },
    openHillFeature: (key: string) => { selectedHillFeatureKey.value = key },
    clearHillFeature: () => { selectedHillFeatureKey.value = null },
    setInput: (v: string) => { input.value = v },
  }
}
