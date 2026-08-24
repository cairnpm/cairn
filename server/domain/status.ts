import type { FeatureStatus } from './types'

// The pre-bet gate used to be the literal string 'shaped' inlined across ~8 query sites. Introducing the
// `shaping` status meant each site needed a DIFFERENT set (some widen to include shaping, some must not),
// so the sets live here once instead of scattering new literals.

// Only `shaped` features are bettable: they feed the scored menu, the betting table, and validation.
// `shaping` is deliberately EXCLUDED — a non-shaped idea can never be bet on.
export const BETTABLE_STATUSES = ['shaped'] as const

// Statuses a new signal can be appended/refined onto (the dedup candidate set). Includes `shaping` so
// signals about the same open question converge onto the existing item instead of multiplying.
export const AMENDABLE_STATUSES = ['shaped', 'shaping'] as const

// Statuses subject to the anti-backlog guard: uncommitted work goes stale and must be re-defended.
// `shaping` is included so parked ideas can't quietly become a graveyard.
export const STALE_STATUSES = ['shaped', 'shaping'] as const

export function isBettable(status: FeatureStatus | null | undefined): boolean {
  return !!status && (BETTABLE_STATUSES as readonly string[]).includes(status)
}

// SQL fragment for an `IN (...)` clause. Values are compile-time constants from this file only — never
// user input — so string-quoting them here carries no injection surface.
export function sqlIn(statuses: readonly string[]): string {
  return statuses.map(s => `'${s}'`).join(', ')
}
