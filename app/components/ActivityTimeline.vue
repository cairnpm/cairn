<script setup lang="ts">
import { ScrollArea } from '@/components/ui/scroll-area'

// Right-hand event feed shared by every detail view: avatar + vertical connector + summary + time.
// `title`/`emptyText` are passed already-translated so this component stays i18n-agnostic.
defineProps<{
  events: { seq: number; actor: string; summary: string; created_at: string }[]
  title: string
  emptyText: string
}>()
</script>

<template>
  <ScrollArea class="h-full">
    <div class="p-6">
      <div class="mb-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">{{ title }} ({{ events.length }})</div>
      <div class="relative flex flex-col gap-4">
        <div v-for="(e, i) in events" :key="e.seq" class="flex gap-2.5">
          <div class="relative flex flex-col items-center">
            <UserAvatar :name="e.actor" class="size-6 shrink-0" />
            <div v-if="i < events.length - 1" class="mt-1 w-px flex-1 bg-border" />
          </div>
          <div class="min-w-0 pb-1 text-sm">
            <div class="leading-snug">{{ e.summary }}</div>
            <TimeAgo :date="e.created_at" class="mt-0.5 block text-xs text-muted-foreground" />
          </div>
        </div>
        <div v-if="!events.length" class="text-sm text-muted-foreground">{{ emptyText }}</div>
      </div>
    </div>
  </ScrollArea>
</template>
