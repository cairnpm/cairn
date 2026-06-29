import { computed } from 'vue'
import { messages, type Lang } from '~/i18n/messages'

// Cookie-backed UI i18n (FR default), survives reloads/SSR. Messages live in ~/i18n/messages.
// t('key') or t('key', { name: 'Marie' }) → interpolates {name} placeholders.
export type { Lang }

export function useUiLang() {
  const locale = useCookie<Lang>('bike-lang', { default: () => 'fr', sameSite: 'lax' })
  const t = (key: string, params?: Record<string, string | number>) => {
    let s = messages[locale.value]?.[key] ?? messages.fr[key] ?? key
    if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v))
    return s
  }
  return {
    locale: computed(() => locale.value),
    setLocale: (l: Lang) => { locale.value = l },
    t,
  }
}
