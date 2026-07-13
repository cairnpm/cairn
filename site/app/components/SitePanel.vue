<script setup lang="ts">
// Framed panel with a chrome bar — the frame every product mock on the landing sits in, so the three
// mocks read as one system.
defineProps<{ title: string }>()
</script>

<template>
  <div class="w-full border bg-card">
    <div class="flex items-center gap-2.5 px-4 py-2.5">
      <div class="flex gap-1.5">
        <span v-for="i in 3" :key="i" class="size-2 rounded-full bg-muted-foreground/25" />
      </div>
      <span class="font-mono text-[11px] text-muted-foreground">{{ title }}</span>
    </div>
    <SiteRule />
    <slot />
  </div>
</template>
