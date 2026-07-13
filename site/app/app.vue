<script setup lang="ts">
import { TooltipProvider } from '@/components/ui/tooltip'

// The product components we reuse read their labels from the cookie-backed locale, which defaults to
// FR. The public site is English-only, so pin it before anything renders.
const { setLocale } = useUiLang()
setLocale('en')

useHead({
  titleTemplate: title => (title ? `${title} · Cairn` : 'Cairn — the PM agent that turns feedback into a roadmap'),
})
useSeoMeta({
  description: 'Cairn is the PM agent that turns a dense, scattered stream of feedback into a roadmap you can reason about. Open, self-hosted, built on Shape Up.',
  ogSiteName: 'Cairn',
  ogTitle: 'Cairn — the PM agent that turns feedback into a roadmap',
  ogDescription: 'Open, self-hosted, built on Shape Up. Bring your own key: no data detour through us.',
  ogType: 'website',
  ogImage: '/og.png',
  twitterCard: 'summary_large_image',
  twitterImage: '/og.png',
})
</script>

<template>
  <!-- The product gets its TooltipProvider from SidebarProvider; the site has no sidebar, so UserAvatar
       (and anything else tooltipped) needs one here. -->
  <TooltipProvider :delay-duration="200">
    <NuxtPage />
  </TooltipProvider>
</template>
