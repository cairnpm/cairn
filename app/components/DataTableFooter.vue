<script setup lang="ts">
// Footer shared by every list screen: the selection/total counter. The lists are NOT paginated — they
// scroll inside the available height (see useDataTable) — so there is nothing else to put here. The
// label arrives already-translated (the screens own their i18n keys + interpolation).
defineProps<{ selectedLabel: string }>()
</script>

<template>
  <div class="flex items-center justify-between gap-4 text-sm">
    <div class="text-muted-foreground">{{ selectedLabel }}</div>
    <slot />
  </div>
</template>
