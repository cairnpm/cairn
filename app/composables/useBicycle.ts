/**
 * UI state only. All domain data now comes from the write gateway (server API);
 * the screens fetch it. This composable holds navigation + view/selection state.
 */
import { computed } from 'vue'

export type Screen = 'intake' | 'backlog' | 'betting' | 'hills'

export const TEAM = [
  { name: 'CEO (vous)', init: 'C', bg: '#18181b' },
  { name: 'Alex', init: 'A', bg: '#2563eb' },
  { name: 'Sam', init: 'S', bg: '#16a34a' },
]

const SCREEN_PATH: Record<Screen, string> = {
  intake: '/',
  backlog: '/backlog',
  betting: '/betting',
  hills: '/hills',
}

/** Avatar initial + colour for an actor name (collaborative attribution). */
export function actorAvatar(name: string | null | undefined): { init: string; bg: string } {
  const n = (name || '').trim()
  const t = TEAM.find(m => m.name.toLowerCase().startsWith(n.toLowerCase()) || m.init === n[0]?.toUpperCase())
  if (t) return { init: t.init, bg: t.bg }
  if (/github/i.test(n)) return { init: '⎇', bg: '#3f3f46' }
  return { init: (n[0] || '?').toUpperCase(), bg: '#a1a1aa' }
}

export function useBicycle() {
  const route = useRoute()

  // Current user (collaborative attribution) — persisted in a cookie, sent to the gateway.
  const author = useCookie<string>('bike-author', { default: () => 'CEO', sameSite: 'lax' })

  const screen = computed<Screen>(() => {
    const p = route.path
    if (p.startsWith('/backlog')) return 'backlog'
    if (p.startsWith('/betting')) return 'betting'
    if (p.startsWith('/hills')) return 'hills'
    return 'intake'
  })
  const selectedHill = computed<string | null>(() => {
    const m = route.path.match(/^\/hills\/(.+)$/)
    return m ? decodeURIComponent(m[1]) : null
  })

  // Backlog view state
  const statusFilter = useState<string>('bike-filter', () => 'all')
  const view = useState<'table' | 'pipeline'>('bike-view', () => 'table')
  const sortKey = useState<string | null>('bike-sortkey', () => null)
  const sortDir = useState<'asc' | 'desc'>('bike-sortdir', () => 'asc')

  // Detail Sheets (per screen)
  const selectedFeatureId = useState<string | null>('bike-feature', () => null)
  const selectedBetId = useState<string | null>('bike-bet', () => null)

  const pageMeta = computed(() => {
    const has = selectedHill.value !== null
    return {
      intake: { title: 'Intake Conversationnel', sub: 'Seul point d\'entrée pour modifier le backlog' },
      backlog: { title: 'Backlog Produit', sub: 'Read-only — modifiable uniquement via la gateway' },
      betting: { title: 'Betting Table', sub: 'Menu généré — le pari reste humain' },
      hills: { title: has ? 'Hill' : 'Hills', sub: has ? 'Détail · paris & avancement' : 'Cycles passés, en cours et planifiés' },
    }[screen.value]
  })

  function toggleSort(key: string) {
    if (sortKey.value === key) sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
    else { sortKey.value = key; sortDir.value = 'asc' }
  }

  return {
    screen, selectedHill, pageMeta, team: TEAM,
    author, setAuthor: (n: string) => { author.value = n },
    statusFilter, view, sortKey, sortDir, toggleSort,
    setStatusFilter: (v: string) => { statusFilter.value = v },
    setView: (v: 'table' | 'pipeline') => { view.value = v },
    selectedFeatureId, selectedBetId,
    selectFeature: (id: string) => { selectedFeatureId.value = id },
    clearFeature: () => { selectedFeatureId.value = null },
    selectBet: (id: string) => { selectedBetId.value = id },
    clearBet: () => { selectedBetId.value = null },
    goTo: (s: Screen) => navigateTo(SCREEN_PATH[s]),
    goToIntake: () => navigateTo('/'),
    openBetting: () => navigateTo('/betting'),
    selectHill: (id: string) => navigateTo(`/hills/${encodeURIComponent(id)}`),
    clearHill: () => navigateTo('/hills'),
  }
}
