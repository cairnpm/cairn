<script setup lang="ts">
import { onUnmounted, ref, watchEffect } from 'vue'
import type { HillDetailData } from '~/types/hill'

const { t } = useUiLang()
const bike = useCairn()
const { selectedHill } = bike
const { data, error } = await useApiData<HillDetailData>(qk.hillDetail, () => `/api/hills/${selectedHill.value}`)

// Feed the breadcrumb (Workspace › Hills › <hill name>).
watchEffect(() => { if (data.value) bike.setCrumb(data.value.hill.name) })
onUnmounted(() => bike.setCrumb(''))

// Peek a feature as a side Sheet (we're on a full page).
const featPeek = ref<string | null>(null)
</script>

<template>
  <DetailState :has-data="!!data" :error="error" :loading-text="t('common.loading')" :not-found-text="t('hill.notFound')">
    <HillDetail v-if="data" :data="data" @select-feature="featPeek = $event" />
    <FeatureDetailOverlay v-model:feature-id="featPeek" mode="sheet" />
  </DetailState>
</template>
