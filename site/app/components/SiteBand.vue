<script setup lang="ts">
// A full-bleed section: no column split, content spans both rails. Exists to break the two-column
// rhythm — a page of nothing but 50/50 rows reads as a template.
defineProps<{ label?: string; title?: string }>()
</script>

<template>
  <section class="border-t px-6 py-16 lg:px-16 lg:py-24">
    <SiteHeading v-if="label && title" :label="label" :title="title" class="max-w-[30ch]" />
    <div :class="label && title ? 'mt-12' : ''">
      <slot />
    </div>
  </section>
</template>
