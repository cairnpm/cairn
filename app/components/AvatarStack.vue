<script setup lang="ts">
import { computed } from 'vue'

// Overlapping row of avatars (builders, voters…), with an em-dash fallback when empty.
const props = withDefaults(defineProps<{
  people: { name: string; src?: string | null; key?: string | number }[]
  size?: 5 | 6 | 8
  empty?: string
}>(), { size: 6, empty: '—' })

// Static literals so Tailwind's scanner emits them.
const SIZE: Record<number, string> = { 5: 'size-5', 6: 'size-6', 8: 'size-8' }
const sizeCls = computed(() => SIZE[props.size] ?? 'size-6')
</script>

<template>
  <div v-if="people.length" class="flex items-center">
    <UserAvatar
      v-for="(p, i) in people" :key="p.key ?? `${p.name}-${i}`"
      :name="p.name" :src="p.src ?? null"
      :class="['-mr-1.5 ring-2 ring-background', sizeCls]"
    />
  </div>
  <span v-else class="text-xs text-muted-foreground">{{ empty }}</span>
</template>
