<script setup lang="ts">
// Generic "label above value" field used in detail headers (Statut, Appétit, Owner, …).
defineProps<{ label: string }>()
</script>

<template>
  <div class="flex flex-col gap-1">
    <span class="text-xs text-muted-foreground">{{ label }}</span>
    <div class="flex min-h-6 items-center gap-1.5 text-sm font-medium"><slot /></div>
  </div>
</template>
