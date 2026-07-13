<script setup lang="ts">
interface Card { name: string; meta?: string; body: string }

// A flush band broken into 3 or 4 cells — the layout and its rules live in SiteFlushRow.
defineProps<{ label: string; title: string; cards: Card[]; cols?: 3 | 4 }>()
</script>

<template>
  <SiteBand :label="label" :title="title" flush>
    <SiteFlushRow :cols="cols ?? 3">
      <div v-for="card in cards" :key="card.name">
        <div class="font-mono text-[12px] text-foreground">{{ card.name }}</div>
        <div v-if="card.meta" class="mt-2.5 text-[13px] font-medium leading-[19px]">{{ card.meta }}</div>
        <p class="mt-2.5 text-[13px] leading-[21px] text-muted-foreground">{{ card.body }}</p>
      </div>
    </SiteFlushRow>
  </SiteBand>
</template>
