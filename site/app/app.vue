<script setup lang="ts">
import { TooltipProvider } from '@/components/ui/tooltip'

// The product components we reuse read their labels from the cookie-backed locale, which defaults to
// FR. The public site is English-only, so pin it before anything renders.
const { setLocale } = useUiLang()
setLocale('en')

const TITLE = 'Cairn — the PM agent that turns feedback into a roadmap'

// The schema resolver rewrites `logo` to an absolute URL but not `screenshot`, and a relative URL in
// JSON-LD is simply dropped. Built from site config so NUXT_SITE_URL still moves it per-deploy.
const OG_IMAGE = `${useSiteConfig().url}/og.png`

useHead({
  titleTemplate: title => (title ? `${title} · Cairn` : TITLE),
  // The brand colour the manifest already declares; browsers tint the mobile URL bar with it.
  meta: [{ name: 'theme-color', content: '#09090b' }],
})

// og:site_name, canonical, og:url and og:locale come from `site` in nuxt.config via nuxt-seo-utils,
// which also rewrites this relative og:image into the absolute URL crawlers require.
useSeoMeta({
  description: 'Cairn is the PM agent that turns a dense, scattered stream of feedback into a roadmap you can reason about. Open, self-hosted, built on Shape Up.',
  ogTitle: TITLE,
  ogDescription: 'Open, self-hosted, built on Shape Up. Bring your own key: no data detour through us.',
  ogType: 'website',
  ogImage: '/og.png',
  // Slack and LinkedIn lay the card out before the image loads; without dimensions they fall back to a
  // small thumbnail and never re-flow. public/og.svg is the source, and it is 1200×630.
  ogImageWidth: 1200,
  ogImageHeight: 630,
  ogImageType: 'image/png',
  ogImageAlt: 'Cairn — the PM agent that turns a scattered stream of feedback into a roadmap.',
  twitterCard: 'summary_large_image',
  // X reads its own tags first and falls back to og: only per-tag, so a missing twitter:title is a
  // missing title, not an inherited one.
  twitterTitle: TITLE,
  twitterDescription: 'Open, self-hosted, built on Shape Up. Bring your own key: no data detour through us.',
  twitterImage: '/og.png',
  twitterImageAlt: 'Cairn — the PM agent that turns a scattered stream of feedback into a roadmap.',
})

// Rich results for an open-source product: what it is, that it costs nothing, and under which licence.
useSchemaOrg([
  defineWebSite({ name: 'Cairn' }),
  defineWebPage(),
  // Ties the graph to a named publisher — without it the SoftwareApplication belongs to nobody, and
  // `sameAs` is what lets Google reconcile the site with the GitHub org.
  defineOrganization({
    name: 'Cairn',
    url: 'https://cairnpm.com',
    logo: '/web-app-manifest-512x512.png',
    sameAs: ['https://github.com/cairnpm'],
  }),
  defineSoftwareApp({
    name: 'Cairn',
    description: 'A self-hosted Shape Up "Product OS": a PM agent that turns a scattered stream of feedback into a roadmap you can reason about.',
    applicationCategory: 'BusinessApplication',
    applicationSubCategory: 'Project Management Software',
    operatingSystem: 'Docker, Node.js',
    license: 'https://github.com/cairnpm/cairn/blob/main/LICENSE',
    softwareHelp: 'https://github.com/cairnpm/cairn/blob/main/DEPLOY.md',
    installUrl: 'https://github.com/cairnpm/cairn/blob/main/DEPLOY.md',
    codeRepository: 'https://github.com/cairnpm/cairn',
    screenshot: OG_IMAGE,
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
