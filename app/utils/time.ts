import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/fr'
import 'dayjs/locale/es'
// 'en' is dayjs's built-in default locale — no import needed.

dayjs.extend(relativeTime)

type Loc = 'fr' | 'en' | 'es'

// Stored timestamps may be 'YYYY-MM-DD HH:MM:SS' (UTC, no T/Z) or ISO — normalize both.
function parse(iso: string) {
  return dayjs(iso.includes(' ') ? `${iso.replace(' ', 'T')}Z` : iso)
}

/** Relative time, localized. Pass `nowMs` (an SSR-stable reference, see useNow) so the server and the
 *  first client render agree — otherwise dayjs's implicit "now" differs and hydration mismatches.
 *  e.g. « il y a 3 jours » / "3 days ago" / "hace 3 días". */
export function timeAgo(iso: string | null | undefined, nowMs?: number, locale: Loc = 'fr'): string {
  if (!iso) return ''
  const d = parse(iso)
  return d.isValid() ? d.locale(locale).from(dayjs(nowMs ?? Date.now())) : ''
}

/** Absolute date, localized, e.g. « 16 juin 2026 » / "Jun 16, 2026" / "16 jun 2026". */
export function formatDate(iso: string | null | undefined, locale: Loc = 'fr'): string {
  if (!iso) return '—'
  const d = parse(iso)
  return d.isValid() ? d.locale(locale).format('D MMM YYYY') : '—'
}
