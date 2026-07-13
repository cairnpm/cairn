<script setup lang="ts">
// Every outbound link on the site — one place for the styling and the rel policy. Callers add layout
// classes (`class="hidden sm:block"`); Vue merges them onto the anchor.
defineProps<{ href: string }>()
</script>

<template>
  <a
    :href="href" target="_blank" rel="noopener noreferrer"
    class="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
  ><slot /></a>
</template>
