import tailwindcss from '@tailwindcss/vite'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  devtools: { enabled: true },

  modules: ['shadcn-nuxt'],

  // Flat component names regardless of subfolders (<IntakeScreen />, not <ScreensIntakeScreen />)
  components: [{ path: '~/components', pathPrefix: false }],

  css: ['~/assets/css/tailwind.css'],

  vite: {
    plugins: [tailwindcss()],
  },

  shadcn: {
    // No prefix on component names: <Button />, <Card />, ...
    prefix: '',
    // Directory that holds the shadcn-vue components
    componentDir: './app/components/ui',
  },

  app: {
    head: {
      title: 'Bicycle — Product OS',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      ],
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap',
        },
      ],
    },
  },
})
