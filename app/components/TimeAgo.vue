<script setup lang="ts">
import { computed } from 'vue'
import { timeAgo } from '~/utils/time'

// Relative timestamp, localized + SSR-stable (no hydration mismatch). Renders a <span>, so any
// class/attr passed to <TimeAgo> falls through to it.
const props = defineProps<{ date: string | null | undefined }>()
const now = useNow()
const { locale } = useUiLang()
const label = computed(() => timeAgo(props.date, now.value, locale.value))
</script>

<template>
  <span>{{ label }}</span>
</template>
