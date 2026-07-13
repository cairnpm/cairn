<script setup lang="ts">
import { CornerDownRight } from 'lucide-vue-next'

// One raw dump in, N distinct signals out. Each proposal carries the routing the agent argues for —
// and the dedupe verdict, which is the whole point: the backlog is meant to stay small.
const SIGNALS = [
  { title: 'Bulk-archive stale signals', status: 'shaped', note: 'New — no match in the backlog.' },
  { title: 'Merge duplicate signals at capture', status: 'building', note: 'Duplicate of #24 — routed there, not created.' },
  { title: 'Export the roadmap as CSV', status: 'shaped', note: 'New — split out of the same thread.' },
]
</script>

<template>
  <SitePanel title="cairn — intake">
    <div class="flex flex-col gap-4 p-4">
      <!-- What a PM actually has: a thread nobody has time to read. -->
      <div class="border bg-background p-3">
        <SiteBracket>Pasted · #product-feedback · 41 messages</SiteBracket>
        <p class="mt-2 text-[13px] leading-[21px] text-muted-foreground">
          “…honestly the backlog is unusable, half of it is the same request three times. Also we keep
          re-filing the dedupe thing. And Ops asked again for a CSV export before Friday…”
        </p>
      </div>

      <div class="flex items-center gap-2 pl-1 text-muted-foreground">
        <CornerDownRight class="size-3.5" />
        <span class="font-mono text-[11px]">3 distinct signals extracted · 1 duplicate merged</span>
      </div>

      <div class="flex flex-col gap-2">
        <div v-for="s in SIGNALS" :key="s.title" class="flex items-start justify-between gap-3 border bg-background p-3">
          <div class="min-w-0">
            <div class="truncate text-[13px] font-medium">{{ s.title }}</div>
            <div class="mt-1 text-[12px] text-muted-foreground">{{ s.note }}</div>
          </div>
          <StatusBadge :status="s.status" />
        </div>
      </div>
    </div>
  </SitePanel>
</template>
