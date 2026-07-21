<script setup lang="ts">
import { TooltipProvider } from '@/components/ui/tooltip'

// The product components we reuse read their labels from the cookie-backed locale, which defaults to
// FR. The public site is English-only, so pin it before anything renders.
const { setLocale } = useUiLang()
setLocale('en')

useHead({
  titleTemplate: title => (title ? `${title} · Cairn` : 'Cairn — the PM agent that turns feedback into a roadmap'),
})

// og:site_name, canonical, og:url and og:locale come from `site` in nuxt.config via nuxt-seo-utils,
// which also rewrites this relative og:image into the absolute URL crawlers require.
useSeoMeta({
  description: 'Cairn is the PM agent that turns a dense, scattered stream of feedback into a roadmap you can reason about. Open, self-hosted, built on Shape Up.',
  ogTitle: 'Cairn — the PM agent that turns feedback into a roadmap',
  ogDescription: 'Open, self-hosted, built on Shape Up. Bring your own key: no data detour through us.',
  ogType: 'website',
  ogImage: '/og.png',
  twitterCard: 'summary_large_image',
  twitterImage: '/og.png',
})

// Rich results for an open-source product: what it is, that it costs nothing, and under which licence.
useSchemaOrg([
  defineWebSite({ name: 'Cairn' }),
  defineWebPage(),
  defineSoftwareApp({
    name: 'Cairn',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Docker, Node.js',
    license: 'https://github.com/cairnpm/cairn/blob/main/LICENSE',
    offers: { '@type': 'Offer', price: 0, priceCurrency: 'USD' },
  }),
])
</script>

<template>
  <!-- The product gets its TooltipProvider from SidebarProvider; the site has no sidebar, so UserAvatar
       (and anything else tooltipped) needs one here. -->
  <TooltipProvider :delay-duration="200">
    <NuxtPage />
  </TooltipProvider>
</template>
