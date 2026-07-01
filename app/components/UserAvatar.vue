<script setup lang="ts">
import { computed } from 'vue'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

// `src` is an uploaded attachment id; when omitted, resolve it from the member's name. Falls back
// to the name's initial. A name tooltip is shown for every avatar app-wide (provider is global).
const props = defineProps<{ name?: string | null; src?: string | null; class?: string | string[] }>()
const { avatarFor } = useMembers()
const initial = computed(() => actorInitial(props.name))
const resolvedSrc = computed(() => props.src ?? avatarFor(props.name))
</script>

<template>
  <Tooltip>
    <TooltipTrigger as-child>
      <Avatar :class="cn('size-6 rounded-md', props.class)">
        <AvatarImage v-if="resolvedSrc" :src="`/api/attachments/${resolvedSrc}`" :alt="name || ''" class="object-cover" />
        <AvatarFallback class="rounded-md bg-muted text-[10px] font-medium">{{ initial }}</AvatarFallback>
      </Avatar>
    </TooltipTrigger>
    <TooltipContent v-if="name">{{ name }}</TooltipContent>
  </Tooltip>
</template>
