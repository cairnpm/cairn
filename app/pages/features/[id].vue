<script setup lang="ts">
import { onUnmounted, watchEffect } from 'vue'
import type { FeatureDetailData } from '~/types/feature'

const route = useRoute()
const bike = useBicycle()
const { data: detail, error } = await useFetch<FeatureDetailData>(() => `/api/features/${route.params.id}`, { getCachedData: getFreshData })

// Feed the breadcrumb (Workspace › Backlog › <feature title>).
watchEffect(() => { if (detail.value) bike.setCrumb(detail.value.feature.title) })
onUnmounted(() => bike.setCrumb(''))
</script>

<template>
  <div class="h-full">
    <FeatureDetail v-if="detail" :detail="detail" />
    <div v-else class="flex h-full items-center justify-center text-sm text-muted-foreground">
      {{ error ? 'Feature introuvable.' : 'Chargement…' }}
    </div>
  </div>
</template>
