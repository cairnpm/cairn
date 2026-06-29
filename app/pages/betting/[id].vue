<script setup lang="ts">
const { t } = useUiLang()
useSeoMeta({ title: () => t('betting.seo.title'), description: () => t('betting.seo.description') })
</script>

<template>
  <BettingTableScreen />
</template>
