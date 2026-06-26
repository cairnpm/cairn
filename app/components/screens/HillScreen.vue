<script setup lang="ts">
import { onUnmounted, ref, watchEffect } from 'vue'
import type { HillDetailData } from '~/types/hill'

const bike = useBicycle()
const { selectedHill } = bike
const { data, error } = await useFetch<HillDetailData>(() => `/api/hills/${selectedHill.value}`, { getCachedData: getFreshData })

// Feed the breadcrumb (Workspace › Hills › <hill name>).
watchEffect(() => { if (data.value) bike.setCrumb(data.value.hill.name) })
onUnmounted(() => bike.setCrumb(''))

// Peek a feature as a side Sheet (we're on a full page).
const featPeek = ref<string | null>(null)
</script>

<template>
  <div class="h-full">
    <HillDetail v-if="data" :data="data" @select-feature="featPeek = $event" />
    <div v-else class="flex h-full items-center justify-center text-sm text-muted-foreground">
      {{ error ? 'Hill introuvable.' : 'Chargement…' }}
    </div>
    <FeatureDetailOverlay v-model:feature-id="featPeek" mode="sheet" />
  </div>
</template>
