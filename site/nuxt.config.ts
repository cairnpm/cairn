import { fileURLToPath } from 'node:url'

const siteSrc = fileURLToPath(new URL('./app', import.meta.url))
const productSrc = fileURLToPath(new URL('../app', import.meta.url))
const productServer = fileURLToPath(new URL('../server', import.meta.url))

/**
 * Public marketing site — a Nuxt layer on top of the product app.
 *
 * It inherits the product's components, composables and design tokens, so the landing showcases the
 * REAL UI (StatusBadge, AvatarStack, Table…) fed with fixtures, instead of screenshots that rot.
 *
 * Two builds, one codebase:
 *   - `pnpm build`         → the product; knows nothing of site/, so the image ships no marketing.
 *   - `pnpm site:generate` → static HTML in site/.output/public. No Nitro, no SQLite, no auth.
 */
export default defineNuxtConfig({
  extends: ['..'],

  // The product's code aliases itself (`@/components/ui/badge`), and Nuxt resolves aliases against the
  // *extending* app — here, site/ — so point them back at the product, or none of it resolves.
  // Site-local modules therefore import each other with relative paths, never `~`.
  alias: { '@': productSrc, '~': productSrc },

  hooks: {
    // A layer inherits the product's pages and its whole server/ tree. The site serves one static page
    // and no API, so drop both: the marketing build then never compiles the gateway, the DB or the LLM
    // provider — and can't boot SQLite while prerendering.
    'pages:extend'(pages) {
      const own = pages.filter(p => p.file?.startsWith(siteSrc))
      pages.splice(0, pages.length, ...own)
    },
    'nitro:config'(config) {
      config.scanDirs = config.scanDirs?.filter(dir => !dir.startsWith(productServer))
    },

    // nuxt-auth-utils is inherited too, and its client plugin fetches /api/_auth/session on mount —
    // a guaranteed 404 on a static host. The site issues no session, so drop the plugin.
    'app:resolve'(app) {
      app.plugins = app.plugins.filter(p => !p.src.includes('nuxt-auth-utils'))
    },
  },

  // Static output — the deployed artifact is plain HTML/CSS/JS.
  nitro: { prerender: { routes: ['/'], crawlLinks: false } },

  // nuxt-auth-utils still wants a session password at build time. The site never issues a session.
  runtimeConfig: { session: { password: 'public-site-issues-no-session-placeholder-32' } },

  app: { head: { htmlAttrs: { lang: 'en' } } },

  // Absolute: `~` points at the product (see alias above).
  components: [{ path: `${siteSrc}/components`, pathPrefix: false }],
})
