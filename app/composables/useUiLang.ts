import { computed } from 'vue'

// Lightweight chrome i18n (FR default + EN), cookie-backed so it survives reloads/SSR.
// Scope = UI chrome (nav, menus, login). Agent-generated content stays in its own language.
export type Lang = 'fr' | 'en'

const MESSAGES: Record<Lang, Record<string, string>> = {
  fr: {
    'nav.intake': 'Intake',
    'nav.backlog': 'Backlog',
    'nav.betting': 'Betting Table',
    'nav.hills': 'Hills',
    'nav.settings': 'Réglages',
    'menu.language': 'Langue',
    'menu.settings': 'Réglages',
    'menu.logout': 'Se déconnecter',
    'user.connectedAs': 'Connecté en tant que',
    'login.title': 'Se connecter',
    'login.email': 'Email',
    'login.password': 'Mot de passe',
    'login.submit': 'Se connecter',
    'login.pending': 'Connexion…',
  },
  en: {
    'nav.intake': 'Intake',
    'nav.backlog': 'Backlog',
    'nav.betting': 'Betting Table',
    'nav.hills': 'Hills',
    'nav.settings': 'Settings',
    'menu.language': 'Language',
    'menu.settings': 'Settings',
    'menu.logout': 'Sign out',
    'user.connectedAs': 'Signed in as',
    'login.title': 'Sign in',
    'login.email': 'Email',
    'login.password': 'Password',
    'login.submit': 'Sign in',
    'login.pending': 'Signing in…',
  },
}

export function useUiLang() {
  const locale = useCookie<Lang>('bike-lang', { default: () => 'fr', sameSite: 'lax' })
  const t = (key: string) => MESSAGES[locale.value]?.[key] ?? MESSAGES.fr[key] ?? key
  return {
    locale: computed(() => locale.value),
    setLocale: (l: Lang) => { locale.value = l },
    t,
  }
}
