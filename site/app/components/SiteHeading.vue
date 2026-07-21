<script setup lang="ts">
// Every section opens the same way: a bracketed label above a tight display heading. One place to
// retune the section type scale.
defineProps<{ label: string; title: string }>()
</script>

<template>
  <div>
    <SiteBracket>{{ label }}</SiteBracket>
    <h2 class="mt-5 text-[26px] font-medium leading-[32px] tracking-[-0.03em] text-balance lg:text-[34px] lg:leading-[40px]">
      {{ title }}
    </h2>
  </div>
</template>
