<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { type ColumnDef } from '@tanstack/vue-table'
import { Check, ExternalLink, MoreHorizontal, Plus, Trash2 } from 'lucide-vue-next'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { formatDate } from '~/utils/time'
import type { BettingTableDetailData } from '~/types/betting'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface TableRowT {
  id: string; title: string; status: string; owner_name: string | null; owner_avatar: string | null
  hill_id: string | null; hill_name: string | null; generated_at: string; validated_at: string | null; validated_by: string | null
  candidate_count: number; voter_count: number; vote_count: number
}

const { t, locale } = useUiLang()
const bike = useCairn()
const { role } = bike
const { data: tables } = await useApiData<TableRowT[]>(qk.bettingTables, '/api/betting-tables', { default: () => [] })
const { mutate } = useApiMutation()
const creating = ref(false)

// Row delete (confirmed via AlertDialog) — works from the list row or the Sheet. Open-state is a
// separate flag so closing the dialog never races with confirmDelete reading the payload.
const toDelete = ref<{ id: string; title: string } | null>(null)
const confirmOpen = ref(false)
const deleting = ref(false)
function askDelete(t: { id: string; title: string }) { toDelete.value = t; confirmOpen.value = true }
async function confirmDelete() {
  if (!toDelete.value || deleting.value) return
  deleting.value = true
  const id = toDelete.value.id
  try {
    await mutate(`/api/betting-tables/${id}`, { method: 'DELETE', invalidates: [qk.bettingTables, qk.overview], success: t('betting.toast.deleted') })
    if (selectedId.value === id) selectedId.value = null
  } finally { deleting.value = false; confirmOpen.value = false; toDelete.value = null }
}

async function createTable() {
  if (creating.value) return
  creating.value = true
  try {
    const r = await mutate<{ id: string }>('/api/betting-tables', { body: { title: '' }, invalidates: [qk.bettingTables, qk.overview], success: t('betting.toast.created') })
    await bike.selectBettingTable(r.id)
  } finally { creating.value = false }
}

// Quick-view Sheet (click a row); the full interactive page is /betting/[id].
const { author } = bike
const selectedId = ref<string | null>(null)
const detail = ref<BettingTableDetailData | null>(null)
async function loadDetail() {
  detail.value = selectedId.value ? await $fetch<BettingTableDetailData>(`/api/betting-tables/${selectedId.value}`) : null
}
watch(selectedId, async () => { detail.value = null; await loadDetail() })
const sheetOpen = computed({
  get: () => selectedId.value !== null,
  set: (v: boolean) => { if (!v) selectedId.value = null },
})

// Vote from the Sheet (same as the dedicated page).
const { iVoted, toggleVote: vote, voting } = useTableVote({
  tableId: selectedId,
  candidates: computed(() => detail.value?.candidates),
  status: computed(() => detail.value?.table.status),
  author,
  invalidates: [qk.bettingTables],
  onVoted: loadDetail,
})

// Validate from the Sheet (owner). Mirrors the dedicated page.
const validateOpen = ref(false)
// Peek a candidate's feature as a modal Dialog (we're already in a Sheet).
const featPeek = ref<string | null>(null)
async function onValidated() {
  await invalidate(qk.bettingTables, qk.hills, qk.features, qk.overview)
  await loadDetail()
}

// Reactivate a soft-deleted table.
const restoring = ref(false)
async function restore(id: string) {
  if (restoring.value) return
  restoring.value = true
  try { await mutate(`/api/betting-tables/${id}/restore`, { invalidates: [qk.bettingTables, qk.overview], success: t('betting.toast.restored') }) } finally { restoring.value = false }
}


const statusFilter = useState<string>('bike-betting-filter', () => 'all')
const counts = computed(() => {
  const t = tables.value
  const by = (s: string) => t.filter(x => x.status === s).length
  const deleted = by('deleted')
  return { all: t.length - deleted, open: by('open'), validated: by('validated'), cancelled: by('cancelled'), deleted }
})
const FILTERS = computed(() => [
  { key: 'all', label: t('betting.filter.all'), n: counts.value.all },
  { key: 'open', label: t('betting.filter.open'), n: counts.value.open },
  { key: 'validated', label: t('betting.filter.validated'), n: counts.value.validated },
  { key: 'cancelled', label: t('betting.filter.cancelled'), n: counts.value.cancelled },
  { key: 'deleted', label: t('betting.filter.deleted'), n: counts.value.deleted },
])

const COL_LABEL = computed<Record<string, string>>(() => ({ title: t('betting.col.title'), status: t('betting.col.status'), candidate_count: t('betting.col.candidates'), vote_count: t('betting.col.votes'), owner: t('betting.col.owner'), generated_at: t('betting.col.created') }))
const columns: ColumnDef<TableRowT>[] = [
  { id: 'title', accessorKey: 'title', enableHiding: false },
  {
    id: 'status', accessorKey: 'status',
    filterFn: (row, _id, val) => {
      const s = row.getValue('status') as string
      if (val === 'all') return s !== 'deleted'
      if (val === 'deleted') return s === 'deleted'
      return s === val
    },
  },
  { id: 'candidate_count', accessorKey: 'candidate_count' },
  { id: 'vote_count', accessorKey: 'vote_count' },
  { id: 'owner', accessorFn: r => r.owner_name || '', enableSorting: false },
  { id: 'generated_at', accessorKey: 'generated_at' },
]

// Betting's filterFn handles the 'all'/'deleted' tabs itself, so the raw value is forwarded as-is.
const { table, vis, hideableCols } = useDataTable({
  data: tables,
  columns,
  initialSort: [{ id: 'generated_at', desc: true }],
  statusFilter,
})
</script>

<template>
  <div class="flex h-full flex-col gap-4 overflow-hidden p-4">
    <!-- Toolbar -->
    <div class="flex items-center justify-between gap-2">
      <StatusFilterTabs v-model="statusFilter" :filters="FILTERS" />
      <div class="flex items-center gap-2">
        <ColumnToggle :columns="hideableCols" :labels="COL_LABEL" :button-text="t('betting.columns')" />
        <Button size="sm" :disabled="creating" @click="createTable"><Plus class="size-4" /> {{ creating ? t('betting.generating') : t('betting.newTable') }}</Button>
      </div>
    </div>

    <!-- Table -->
    <div class="flex-1 overflow-auto rounded-lg border">
      <Table>
        <TableHeader class="bg-muted/50 sticky top-0">
          <TableRow>
            <TableHead class="w-10"><SelectAllCheckbox :table="table" :aria-label="t('betting.selectAll')" /></TableHead>
            <TableHead><SortHeaderButton :table="table" column="title" :label="t('betting.col.title')" /></TableHead>
            <TableHead v-if="vis('status')" class="w-32"><SortHeaderButton :table="table" column="status" :label="t('betting.col.status')" /></TableHead>
            <TableHead v-if="vis('candidate_count')" class="w-28 text-right"><SortHeaderButton :table="table" column="candidate_count" :label="t('betting.col.candidates')" /></TableHead>
            <TableHead v-if="vis('vote_count')" class="w-24 text-right"><SortHeaderButton :table="table" column="vote_count" :label="t('betting.col.votes')" /></TableHead>
            <TableHead v-if="vis('owner')" class="w-32">{{ t('betting.col.owner') }}</TableHead>
            <TableHead v-if="vis('generated_at')" class="w-28 text-right"><SortHeaderButton :table="table" column="generated_at" :label="t('betting.col.created')" /></TableHead>
            <TableHead class="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="row in table.getRowModel().rows" :key="row.id" :data-state="row.getIsSelected() ? 'selected' : undefined" class="cursor-pointer" @click="selectedId = row.original.id">
            <TableCell @click.stop><SelectRowCheckbox :row="row" :aria-label="t('betting.selectRow')" /></TableCell>
            <TableCell>
              <div class="flex items-center gap-2 font-medium">
                {{ row.original.title }}
                <NuxtLink
                  v-if="row.original.hill_id"
                  :to="`/hills/${row.original.hill_id}`"
                  class="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground hover:text-foreground hover:underline"
                  @click.stop
                >
                  {{ row.original.hill_name || t('betting.cycle') }}
                  <ExternalLink class="size-3" />
                </NuxtLink>
              </div>
            </TableCell>
            <TableCell v-if="vis('status')"><StatusBadge :status="row.original.status" /></TableCell>
            <TableCell v-if="vis('candidate_count')" class="text-right tabular-nums">{{ row.original.candidate_count }}</TableCell>
            <TableCell v-if="vis('vote_count')" class="text-right tabular-nums">{{ row.original.vote_count }}</TableCell>
            <TableCell v-if="vis('owner')">
              <div class="flex items-center gap-1.5 text-sm"><UserAvatar :name="row.original.owner_name" :src="row.original.owner_avatar" /><span class="truncate text-muted-foreground">{{ row.original.owner_name || '—' }}</span></div>
            </TableCell>
            <TableCell v-if="vis('generated_at')" class="text-right text-muted-foreground whitespace-nowrap">{{ formatDate(row.original.generated_at, locale) }}</TableCell>
            <TableCell @click.stop>
              <ResourceActionsMenu
                :is-deleted="row.original.status === 'deleted'" :restoring="restoring"
                :actions-label="t('betting.actions')" :restore-label="t('betting.restore')" :delete-label="t('betting.delete')"
                @restore="restore(row.original.id)" @delete="askDelete({ id: row.original.id, title: row.original.title })"
              />
            </TableCell>
          </TableRow>
          <TableRow v-if="!table.getRowModel().rows.length">
            <TableCell :colspan="8" class="h-24 text-center text-muted-foreground">{{ t('betting.empty') }}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>

    <!-- Footer / pagination -->
    <DataTablePagination
      :table="table"
      :selected-label="t('betting.selectedCount', { n: table.getFilteredSelectedRowModel().rows.length, total: table.getFilteredRowModel().rows.length })"
      :rows-per-page-label="t('betting.rowsPerPage')"
      :page-label="t('betting.page', { page: table.getState().pagination.pageIndex + 1, total: Math.max(1, table.getPageCount()) })"
    />

    <p v-if="role !== 'owner'" class="text-xs text-muted-foreground">{{ t('betting.voterHint') }}</p>

    <!-- Quick-view Sheet -->
    <DetailSheet
      v-model:open="sheetOpen" :ready="!!detail"
      :title="detail?.table.title ?? ''" :open-page-to="`/betting/${detail?.table.id}`"
      :open-page-title="t('betting.openTablePage')" :open-page-label="t('betting.openPage')"
    >
      <template #actions>
        <DropdownMenu v-if="detail">
          <DropdownMenuTrigger as-child>
            <button
              :title="t('betting.actions')"
              class="ring-offset-background focus:ring-ring absolute top-4 right-[4.75rem] rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden"
            >
              <MoreHorizontal class="size-4" />
              <span class="sr-only">{{ t('betting.actions') }}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem variant="destructive" @click="askDelete({ id: detail.table.id, title: detail.table.title }); selectedId = null"><Trash2 /> {{ t('betting.delete') }}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </template>
      <template v-if="detail">
        <BettingTableDetail :data="detail" compact @select-feature="featPeek = $event">
          <template #candidate-action="{ candidate }">
            <Button v-if="detail.table.status === 'open'" :variant="iVoted(candidate) ? 'default' : 'outline'" size="sm" :disabled="voting" @click="vote(candidate.id)">
              <Check class="size-3.5" /> {{ iVoted(candidate) ? t('betting.voted') : t('betting.vote') }}
            </Button>
          </template>
          <template v-if="detail.table.status === 'open' && role === 'owner'" #candidates-footer>
            <Button @click="validateOpen = true">{{ t('betting.validate') }}</Button>
          </template>
        </BettingTableDetail>
        <ValidateTableDialog v-model:open="validateOpen" :table-id="detail.table.id" :candidates="detail.candidates" @validated="onValidated" />
      </template>
    </DetailSheet>

    <!-- Feature peek — from the Sheet, open the feature as a modal Dialog -->
    <FeatureDetailOverlay v-model:feature-id="featPeek" mode="dialog" />

    <!-- Delete confirmation -->
    <ConfirmDeleteDialog
      v-model:open="confirmOpen" :deleting="deleting"
      :title="t('betting.deleteDialog.title')"
      :description="t('betting.deleteDialog.description', { title: toDelete?.title })"
      :cancel-label="t('betting.cancel')" :confirm-label="deleting ? t('betting.deleting') : t('betting.delete')"
      @confirm="confirmDelete"
    />
  </div>
</template>
