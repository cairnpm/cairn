/**
 * UI state only. All domain data now comes from the write gateway (server API);
 * the screens fetch it. This composable holds navigation + view/selection state.
 */
import { computed } from 'vue'

export type Screen = 'intake' | 'backlog' | 'betting' | 'hills' | 'settings'

export const TEAM = [
  { name: 'CEO', init: 'C' },
  { name: 'Alex', init: 'A' },
  { name: 'Sam', init: 'S' },
]

const SCREEN_PATH: Record<Screen, string> = {
  intake: '/',
  backlog: '/backlog',
  betting: '/betting',
  hills: '/hills',
  settings: '/settings',
}

/** Initial for an actor name — used by the shared UserAvatar fallback. */
export function actorInitial(name: string | null | undefined): string {
  return (name || '?').trim()[0]?.toUpperCase() || '?'
}

export function useBicycle() {
  const route = useRoute()

  // Current user (collaborative attribution) — derived from the authenticated session.
  const { user, clear: clearSession } = useUserSession()
  const author = computed<string>(() => (user.value?.name as string) || '—')
  const role = computed<string>(() => (user.value?.role as string) || 'member')

  const screen = computed<Screen>(() => {
    const p = route.path
    if (p.startsWith('/backlog') || p.startsWith('/features')) return 'backlog'
    if (p.startsWith('/betting')) return 'betting'
    if (p.startsWith('/hills')) return 'hills'
    if (p.startsWith('/settings')) return 'settings'
    return 'intake'
  })
  const selectedHill = computed<string | null>(() => {
    const m = route.path.match(/^\/hills\/(.+)$/)
    return m ? decodeURIComponent(m[1]) : null
  })
  const selectedBettingTable = computed<string | null>(() => {
    const m = route.path.match(/^\/betting\/(.+)$/)
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
      settings: { title: 'Réglages', sub: 'Clé Anthropic, modèle & membres' },
    }[screen.value]
  })

  // Breadcrumb trail. Detail pages (e.g. /features/[id]) set `crumb` to their title.
  const crumb = useState<string>('bike-crumb', () => '')
  const breadcrumb = computed<{ label: string; to?: string }[]>(() => {
    if (route.path.startsWith('/features/')) return [{ label: 'Backlog', to: '/backlog' }, { label: crumb.value || 'Feature' }]
    return [{ label: pageMeta.value.title }]
  })

  function toggleSort(key: string) {
    if (sortKey.value === key) sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
    else { sortKey.value = key; sortDir.value = 'asc' }
  }

  async function logout() {
    await clearSession()
    await navigateTo('/login')
  }

  return {
    screen, selectedHill, selectedBettingTable, pageMeta, team: TEAM,
    breadcrumb, setCrumb: (s: string) => { crumb.value = s },
    author, role, logout,
    selectBettingTable: (id: string) => navigateTo(`/betting/${encodeURIComponent(id)}`),
    clearBettingTable: () => navigateTo('/betting'),
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
