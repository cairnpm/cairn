<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import type { BettingTableDetailData } from '~/types/betting'

const { t } = useUiLang()
const bike = useCairn()
const { author, role, selectedBettingTable } = bike
const id = selectedBettingTable
const { data, error } = await useApiData<BettingTableDetailData>(qk.bettingTableDetail, () => `/api/betting-tables/${id.value}`)
function onValidated() { return invalidate(qk.bettingTableDetail, qk.bettingTables, qk.hills, qk.features, qk.overview) }

const { isDeleted, confirmOpen, deleting, restoring, confirmDelete, restore } = useDetailCrud({
  resource: 'betting-tables',
  id: computed(() => id.value as string),
  title: computed(() => data.value?.table.title),
  status: computed(() => data.value?.table.status),
  listRoute: '/betting',
  invalidates: { delete: [qk.bettingTables, qk.overview], restore: [qk.bettingTableDetail, qk.bettingTables, qk.overview] },
  toasts: { deleted: () => t('betting.toast.deleted'), restored: () => t('betting.toast.restored') },
})

const { iVoted, toggleVote, voting } = useTableVote({
  tableId: computed(() => id.value),
  candidates: computed(() => data.value?.candidates),
  status: computed(() => data.value?.table.status),
  author,
  invalidates: [qk.bettingTableDetail, qk.bettingTables],
})

const showValidate = ref(false)
const featPeek = ref<string | null>(null)
const isOpen = computed(() => data.value?.table.status === 'open')
</script>

<template>
  <DetailState :has-data="!!data" :error="error" :loading-text="t('common.loading')" :not-found-text="t('betting.notFound')">
    <div v-if="data" class="h-full">
    <BettingTableDetail :data="data" @select-feature="featPeek = $event">
      <template #header-action>
        <ResourceActionsMenu
          :is-deleted="isDeleted" :restoring="restoring"
          :actions-label="t('betting.actions')" :restore-label="t('betting.restore')" :delete-label="t('betting.delete')"
          @restore="restore" @delete="confirmOpen = true"
        />
      </template>
      <template #candidate-action="{ candidate }">
        <Button v-if="isOpen" :variant="iVoted(candidate) ? 'default' : 'outline'" size="sm" :disabled="voting" @click="toggleVote(candidate.id)">
          <Check class="size-3.5" /> {{ iVoted(candidate) ? t('betting.voted') : t('betting.vote') }}
        </Button>
      </template>
      <template v-if="isOpen && role === 'owner'" #candidates-footer>
        <Button @click="showValidate = true">{{ t('betting.validate') }}</Button>
      </template>
    </BettingTableDetail>

    <!-- Feature peek — from the dedicated page, open the feature as a side Sheet -->
    <FeatureDetailOverlay v-model:feature-id="featPeek" mode="sheet" />

    <!-- Validate dialog -->
    <ValidateTableDialog v-model:open="showValidate" :table-id="id" :candidates="data.candidates" @validated="onValidated" />

    <!-- Delete confirmation -->
    <ConfirmDeleteDialog
      v-model:open="confirmOpen" :deleting="deleting"
      :title="t('betting.deleteDialog.title')"
      :description="t('betting.deleteDialog.description', { title: data.table.title })"
      :cancel-label="t('betting.cancel')" :confirm-label="deleting ? t('betting.deleting') : t('betting.delete')"
      @confirm="confirmDelete"
    />
    </div>
  </DetailState>
</template>
