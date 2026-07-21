import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'

// The public site (site/) extends this app as a Nuxt layer, and a layer's relative paths resolve
// against the *extending* app — not against this directory. Anchor them, or the site build re-resolves
// them onto itself and registers every component twice.
const appDir = fileURLToPath(new URL('./app', import.meta.url))

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  devtools: { enabled: true },

  modules: ['shadcn-nuxt', 'nuxt-auth-utils'],

  // Session cookie: Secure only in production. On http://localhost, Safari refuses a Secure cookie
  // (Chrome tolerates it), so dev logins on Safari would silently fail without this.
  runtimeConfig: {
    session: {
      password: '', // overridden at runtime by NUXT_SESSION_PASSWORD; placeholder satisfies the type
      cookie: {
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },

  // Flat component names regardless of subfolders (<IntakeScreen />, not <ScreensIntakeScreen />)
  components: [{ path: `${appDir}/components`, pathPrefix: false }],

  css: [`${appDir}/assets/css/tailwind.css`],

  vite: {
    plugins: [tailwindcss()],
  },

  shadcn: {
    // No prefix on component names: <Button />, <Card />, ...
    prefix: '',
    // Directory that holds the shadcn-vue components
    componentDir: `${appDir}/components/ui`,
  },

  app: {
    head: {
      htmlAttrs: { class: 'dark', lang: 'fr' },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'icon', type: 'image/png', sizes: '96x96', href: '/favicon-96x96.png' },
        { rel: 'shortcut icon', href: '/favicon.ico' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
        { rel: 'manifest', href: '/site.webmanifest' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap',
        },
      ],
    },
  },
})
