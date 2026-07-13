<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { LINKS } from '../utils/site'

const NAV = [
  { label: 'How it works', href: LINKS.intake },
  { label: 'Roadmap', href: LINKS.roadmap },
  { label: 'GitHub', href: LINKS.repo },
]
</script>

<template>
  <header class="sticky top-0 z-50 border-b bg-background/85 backdrop-blur">
    <nav class="flex h-14 items-center justify-between px-6 lg:px-10">
      <a href="/"><SiteWordmark /></a>

      <div class="flex items-center gap-6">
        <SiteLink v-for="link in NAV" :key="link.label" :href="link.href" class="hidden sm:block">
          {{ link.label }}
        </SiteLink>

        <Button as-child size="sm" class="rounded-none">
          <a :href="LINKS.selfHost" target="_blank" rel="noopener noreferrer">Self-host</a>
        </Button>
      </div>
    </nav>
  </header>
</template>
