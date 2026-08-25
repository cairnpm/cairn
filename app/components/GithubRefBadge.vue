<script setup lang="ts">
import { ExternalLink } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'

// A GitHub PR or issue reference, as an outbound badge. `compact` drops the repo prefix for the
// detail header, where the row is already tight and the repo is the workspace's linked one anyway.
defineProps<{ url: string; repo: string; number: number; status: string; compact?: boolean }>()
</script>

<template>
  <a :href="url" target="_blank" rel="noopener noreferrer" class="inline-flex">
    <Badge variant="outline" class="gap-1.5 font-mono font-normal hover:bg-muted">
      <GithubMark class="size-3.5 shrink-0" />
      <span class="truncate">{{ compact ? '' : `${repo}` }}#{{ number }}</span>
      <span class="text-muted-foreground">· {{ status }}</span>
      <ExternalLink class="size-3 shrink-0 opacity-60" />
    </Badge>
  </a>
</template>
