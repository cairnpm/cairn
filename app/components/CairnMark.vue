<script setup lang="ts">
// Cairn symbol — stacked stones. Default palette reads on light surfaces; `inverted` is the dark-bg
// variant (light head + lighter stones) so the mark stands out directly on the app's black background.
defineProps<{ inverted?: boolean }>()
</script>

<template>
  <svg viewBox="0 0 100 150" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="8" y="124" width="84" height="24" rx="12" :fill="inverted ? '#71717A' : '#A1A1AA'" transform="rotate(-2 50 136)" />
    <circle cx="71" cy="112" r="12" :fill="inverted ? '#A1A1AA' : '#71717A'" />
    <rect x="12" y="89" width="76" height="20" rx="10" :fill="inverted ? '#A1A1AA' : '#52525B'" transform="rotate(-25 50 99)" />
    <path d="M26 66 L74 66 A24 24 0 0 1 26 66 Z" :fill="inverted ? '#D4D4D8' : '#3F3F46'" />
    <circle cx="50" cy="48" r="18" :fill="inverted ? '#FAFAFA' : '#18181B'" />
  </svg>
</template>
