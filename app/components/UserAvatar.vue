<script setup lang="ts">
import { computed } from 'vue'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

// `src` is an uploaded attachment id; when omitted, resolve it from the member's name. Falls back
// to the name's initial.
const props = defineProps<{ name?: string | null; src?: string | null; class?: string }>()
const { avatarFor } = useMembers()
const initial = computed(() => (props.name || '?').trim()[0]?.toUpperCase() || '?')
const resolvedSrc = computed(() => props.src ?? avatarFor(props.name))
</script>

<template>
  <Avatar :class="cn('size-6 rounded-md', props.class)">
    <AvatarImage v-if="resolvedSrc" :src="`/api/attachments/${resolvedSrc}`" :alt="name || ''" class="object-cover" />
    <AvatarFallback class="rounded-md bg-muted text-[10px] font-medium">{{ initial }}</AvatarFallback>
  </Avatar>
</template>
