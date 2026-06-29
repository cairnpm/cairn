<script setup lang="ts">
const { t } = useUiLang()
useSeoMeta({ title: () => t('intake.seoTitle'), description: () => t('intake.seoDesc') })
</script>

<template>
  <IntakeScreen />
</template>
