<script setup lang="ts">
import { LINKS } from '../utils/site'

const COLUMNS = [
  {
    title: 'Product',
    links: [
      { label: 'How the agent works', href: LINKS.intake },
      { label: 'Roadmap', href: LINKS.roadmap },
      { label: 'Self-host', href: LINKS.selfHost },
    ],
  },
  {
    title: 'Project',
    links: [
      { label: 'GitHub', href: LINKS.repo },
      { label: 'Contributing', href: LINKS.contributing },
      { label: 'License', href: LINKS.license },
    ],
  },
]
</script>

<template>
  <footer class="border-t">
    <div class="grid gap-10 px-6 py-14 sm:grid-cols-2 lg:grid-cols-4 lg:px-10">
      <div class="lg:col-span-2">
        <SiteWordmark />
        <p class="mt-4 max-w-[34ch] text-[13px] leading-[21px] text-muted-foreground">
          The PM agent that turns a scattered stream of feedback into a roadmap you can reason about.
        </p>
      </div>

      <div v-for="col in COLUMNS" :key="col.title" class="flex flex-col gap-3">
        <SiteBracket>{{ col.title }}</SiteBracket>
        <SiteLink v-for="link in col.links" :key="link.label" :href="link.href">{{ link.label }}</SiteLink>
      </div>
    </div>

    <div class="border-t px-6 py-5 lg:px-10">
      <p class="font-mono text-[11px] text-muted-foreground">
        FSL-1.1-ALv2 — source-available, Apache-2.0 two years after each release. © 2026 The Cairn Authors.
      </p>
    </div>
  </footer>
</template>
