<script setup lang="ts">
const { t } = useUiLang()
useSeoMeta({ title: () => t('settings.seo.title'), description: () => t('settings.seo.description') })
</script>

<template>
  <SettingsScreen />
</template>
