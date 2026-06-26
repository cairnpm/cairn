<script setup lang="ts">
import { computed } from 'vue'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

const props = defineProps<{ name?: string | null; class?: string }>()
const initial = computed(() => (props.name || '?').trim()[0]?.toUpperCase() || '?')
</script>

<template>
  <Avatar :class="cn('size-6 rounded-md', props.class)">
    <AvatarFallback class="rounded-md bg-muted text-[10px] font-medium">{{ initial }}</AvatarFallback>
  </Avatar>
</template>
