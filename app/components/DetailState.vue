<script setup lang="ts">
// Renders the detail content once data is present, else a centered loading / not-found message.
// Replaces the copy-pasted (and previously inconsistent) "Chargement… / introuvable" blocks.
defineProps<{
  hasData: boolean
  error?: unknown
  loadingText: string
  notFoundText: string
}>()
</script>

<template>
  <div class="h-full">
    <slot v-if="hasData" />
    <div v-else class="flex h-full items-center justify-center text-sm text-muted-foreground">
      {{ error ? notFoundText : loadingText }}
    </div>
  </div>
</template>
