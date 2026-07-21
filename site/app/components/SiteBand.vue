<script setup lang="ts">
// A full-bleed section: no column split, content spans both rails. Exists to break the two-column
// rhythm — a page of nothing but 50/50 rows reads as a template.
//
// `flush` hands the body the full width and drops the bottom padding, so a SiteFlushRow sits against
// the section's edges: its top rule reaches the rails, and the NEXT section's border-top closes it.
defineProps<{ label?: string; title?: string; flush?: boolean }>()
</script>

<template>
  <section class="border-t">
    <div :class="['px-6 lg:px-16', flush ? 'pt-16 lg:pt-24' : 'py-16 lg:py-24']">
      <SiteHeading v-if="label && title" :label="label" :title="title" class="max-w-[30ch]" />
      <div v-if="!flush" :class="label && title ? 'mt-12' : ''">
        <slot />
      </div>
    </div>

    <div v-if="flush" class="mt-12">
      <slot />
    </div>
  </section>
</template>
