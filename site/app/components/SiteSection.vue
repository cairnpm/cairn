<script setup lang="ts">
// One feature row: copy on one side, a product mock on the other, split by a rule. `reverse` flips the
// sides so consecutive sections alternate.
defineProps<{ label: string; title: string; reverse?: boolean }>()
</script>

<template>
  <section class="grid border-t lg:grid-cols-2">
    <!-- min-w-0: a grid child defaults to min-width:auto, so a wide mock (table, code block) would
         stretch its column past the viewport instead of scrolling inside itself. -->
    <div :class="['flex min-w-0 flex-col justify-center px-6 py-14 lg:px-16 lg:py-24', reverse ? 'lg:order-2 lg:border-l' : '']">
      <SiteHeading :label="label" :title="title" />
      <div class="mt-5 max-w-[48ch] text-[15px] leading-[25px] text-muted-foreground">
        <slot name="body" />
      </div>
    </div>

    <div :class="['flex min-w-0 items-center bg-background px-6 py-14 lg:px-12 lg:py-24', reverse ? 'lg:order-1' : 'lg:border-l']">
      <slot name="visual" />
    </div>
  </section>
</template>
