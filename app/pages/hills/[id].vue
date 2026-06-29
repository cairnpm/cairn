<script setup lang="ts">
const { t } = useUiLang()
useSeoMeta({ title: () => t('hill.seoTitle'), description: () => t('hill.seoDesc') })
</script>

<template>
  <HillScreen />
</template>
