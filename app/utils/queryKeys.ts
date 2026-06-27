// Single source of truth for the app's data-cache keys. Reads register under a key (useApiData),
// mutations invalidate keys (useApiMutation) so every view showing that resource re-syncs.
// Detail views show one entity at a time, so a single key per detail view is enough.
export const qk = {
  features: 'features',
  featureDetail: 'feature-detail',
  bettingTables: 'betting-tables',
  bettingTableDetail: 'betting-table-detail',
  hills: 'hills',
  hillDetail: 'hill-detail',
  members: 'members',
  overview: 'overview',
  settings: 'settings',
  profile: 'profile',
} as const

export type QueryKey = typeof qk[keyof typeof qk]
