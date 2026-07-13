<script setup lang="ts">
import { computed } from 'vue'

interface Card { name: string; meta?: string; body: string }

// A full-width band broken into 3 or 4 flush cells. `gap-px` over `bg-border` draws the separators:
// unlike `divide-*` or per-cell borders, it survives wrapping without doubling a line against the rails.
const props = defineProps<{ label: string; title: string; cards: Card[]; cols?: 3 | 4 }>()

// Static literals so Tailwind's scanner emits them.
const COLS: Record<number, string> = { 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4' }
const colsCls = computed(() => COLS[props.cols ?? 3] ?? COLS[3])
</script>

<template>
  <SiteBand :label="label" :title="title">
    <div :class="['grid gap-px border-y bg-border sm:grid-cols-2', colsCls]">
      <div v-for="card in cards" :key="card.name" class="min-w-0 bg-background p-6">
        <div class="font-mono text-[12px] text-foreground">{{ card.name }}</div>
        <div v-if="card.meta" class="mt-2.5 text-[13px] font-medium leading-[19px]">{{ card.meta }}</div>
        <p class="mt-2.5 text-[13px] leading-[21px] text-muted-foreground">{{ card.body }}</p>
      </div>
    </div>
  </SiteBand>
</template>
