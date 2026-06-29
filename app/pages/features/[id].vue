<script setup lang="ts">
import { computed } from 'vue'
import type { FeatureDetailData } from '~/types/feature'

const route = useRoute()
const bike = useCairn()
const { t } = useUiLang()
const id = computed(() => route.params.id as string)
const { data: detail, error } = await useApiData<FeatureDetailData>(qk.featureDetail, () => `/api/features/${id.value}`)

// Deep links share the feature's own title + problem.
useSeoMeta({
  title: () => detail.value?.feature.title || t('feature.fallbackTitle'),
  description: () => detail.value?.feature.problem?.slice(0, 160) || t('feature.fallbackDescription'),
})

const { isDeleted, confirmOpen, deleting, restoring, confirmDelete, restore } = useDetailCrud({
  resource: 'features',
  id,
  title: computed(() => detail.value?.feature.title),
  status: computed(() => detail.value?.feature.status),
  listRoute: '/backlog',
  invalidates: { delete: [qk.features, qk.overview], restore: [qk.featureDetail, qk.features, qk.overview] },
  toasts: { deleted: () => t('feature.toast.deleted'), restored: () => t('feature.toast.restored') },
  onDelete: () => { if (bike.selectedFeatureId.value === id.value) bike.clearFeature() },
})
</script>

<template>
  <DetailState :has-data="!!detail" :error="error" :loading-text="t('common.loading')" :not-found-text="t('feature.notFound')">
    <FeatureDetail v-if="detail" :detail="detail">
      <template #header-action>
        <ResourceActionsMenu
          :is-deleted="isDeleted" :restoring="restoring"
          :actions-label="t('feature.actions')" :restore-label="t('feature.reactivate')" :delete-label="t('feature.delete')"
          @restore="restore" @delete="confirmOpen = true"
        />
      </template>
    </FeatureDetail>

    <ConfirmDeleteDialog
      v-model:open="confirmOpen" :deleting="deleting"
      :title="t('feature.deleteDialog.title')"
      :description="t('feature.deleteDialog.description', { title: detail?.feature.title })"
      :cancel-label="t('feature.cancel')" :confirm-label="deleting ? t('feature.deleting') : t('feature.delete')"
      @confirm="confirmDelete"
    />
  </DetailState>
</template>
