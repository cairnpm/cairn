<script setup lang="ts">
import { Toaster } from '@/components/ui/sonner'

// Per-page <title> becomes "Intake · Cairn"; the home/default is the tagline.
useHead({
  titleTemplate: title => (title ? `${title} · Cairn` : 'Cairn — transformez le feedback épars en roadmap claire'),
})
// Defaults for any shared deep link (pages override title/description below).
useSeoMeta({
  description: "L'agent PM qui transforme le feedback épars en roadmap claire. Open source, auto-hébergé, basé sur Shape Up.",
  ogSiteName: 'Cairn',
  ogTitle: 'Cairn',
  ogDescription: "L'agent PM qui transforme le feedback épars en roadmap claire.",
  ogType: 'website',
  ogImage: '/og.png',
  twitterCard: 'summary_large_image',
  twitterImage: '/og.png',
})
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
  <Toaster />
</template>
