<script setup lang="ts">
import { ScrollArea } from '@/components/ui/scroll-area'

// Shared shell for the detail views: a bordered header (title row + meta row) over a scrollable body.
// With `asideWidth` the body is two columns (content + a right aside); without it, a single column.
// `compact` reserves room (pr/mr-24) for the quick-view Sheet's corner buttons.
// Slots: #title, #header-action, #meta, default (left/main content), #aside.
defineProps<{ asideWidth?: number; compact?: boolean }>()
</script>

<template>
  <div class="flex h-full flex-col">
    <header class="flex flex-col gap-3 border-b px-6 py-4">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0" :class="{ 'pr-24': compact }"><slot name="title" /></div>
        <div class="flex items-center gap-2" :class="{ 'mr-24': compact }"><slot name="header-action" /></div>
      </div>
      <div class="flex flex-wrap items-center gap-x-6 gap-y-2"><slot name="meta" /></div>
    </header>

    <div
      v-if="asideWidth"
      class="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[minmax(0,1fr)_var(--aside-w)]"
      :style="{ '--aside-w': `${asideWidth}px` }"
    >
      <ScrollArea class="min-h-0"><slot /></ScrollArea>
      <aside class="min-h-0 border-t bg-muted/20 md:border-l md:border-t-0"><slot name="aside" /></aside>
    </div>
    <ScrollArea v-else class="min-h-0 flex-1"><slot /></ScrollArea>
  </div>
</template>
