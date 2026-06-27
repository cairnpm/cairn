import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/fr'

dayjs.extend(relativeTime)
dayjs.locale('fr')

/** Relative French time, e.g. « il y a 3 jours ». Stored timestamps may be 'YYYY-MM-DD HH:MM:SS'
 *  (UTC, no T/Z) or ISO — normalize both. */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = dayjs(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`)
  return d.isValid() ? d.fromNow() : ''
}
