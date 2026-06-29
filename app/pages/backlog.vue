<script setup lang="ts">
const { t } = useUiLang()
useSeoMeta({ title: () => t('backlog.seoTitle'), description: () => t('backlog.seoDesc') })
</script>

<template>
  <BacklogScreen />
</template>
