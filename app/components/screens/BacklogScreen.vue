<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { type ColumnDef } from '@tanstack/vue-table'
import { ExternalLink } from 'lucide-vue-next'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '~/utils/time'

interface Feature {
  id: string; title: string; problem: string; appetite: string | null
  status: string; stale: number; hill_id: string | null; hill_name: string | null
  signal_count: number; updated_at: string; last_actor: string | null
  shapers: { user_id: string; name: string; avatar_url: string | null }[]
}

const { t, locale } = useUiLang()
const bike = useCairn()
const { statusFilter, selectedFeatureId } = bike
const { data: features } = await useApiData<Feature[]>(qk.features, '/api/features', { default: () => [] })
const { mutate } = useApiMutation()

// Row delete (confirmed via AlertDialog). Open-state is a separate flag so closing the dialog
// never races with confirmDelete reading the payload.
const toDelete = ref<Feature | null>(null)
const confirmOpen = ref(false)
const deleting = ref(false)
function askDelete(f: Feature) { toDelete.value = f; confirmOpen.value = true }
async function confirmDelete() {
  if (!toDelete.value || deleting.value) return
  deleting.value = true
  const id = toDelete.value.id
  try {
    await mutate(`/api/features/${id}`, { method: 'DELETE', invalidates: [qk.features, qk.overview], success: t('backlog.toastDeleted') })
    if (selectedFeatureId.value === id) bike.clearFeature()
  } finally { deleting.value = false; confirmOpen.value = false; toDelete.value = null }
}


const counts = computed(() => {
  const f = features.value
  const by = (s: string) => f.filter(x => x.status === s).length
  const deleted = by('deleted')
  return { all: f.length - deleted, shaped: by('shaped'), bet: by('bet'), building: by('building'), done: by('done'), deleted }
})
const FILTERS = computed(() => [
  { key: 'all', label: t('backlog.filters.all'), n: counts.value.all },
  { key: 'shaped', label: 'Shaped', n: counts.value.shaped },
  { key: 'bet', label: 'Bet', n: counts.value.bet },
  { key: 'building', label: 'Building', n: counts.value.building },
  { key: 'done', label: 'Done', n: counts.value.done },
  { key: 'deleted', label: t('backlog.filters.deleted'), n: counts.value.deleted },
])

// Restore a soft-deleted feature.
const restoring = ref(false)
async function restore(id: string) {
  if (restoring.value) return
  restoring.value = true
  try { await mutate(`/api/features/${id}/restore`, { invalidates: [qk.features, qk.overview], success: t('backlog.toastRestored') }) } finally { restoring.value = false }
}

// ── Table ─────────────────────────────────────────────────────────────────
// Backlog's status filter lives in the store (so it survives navigation); expose a writable model.
const statusModel = computed({ get: () => statusFilter.value, set: (v: string) => bike.setStatusFilter(v) })

const COL_LABEL = computed<Record<string, string>>(() => ({ title: t('backlog.col.title'), status: t('backlog.col.status'), signal_count: t('backlog.col.signals'), shapers: 'Shapers', hill: 'Hill', updated_at: t('backlog.col.updated'), actor: t('backlog.col.actor') }))
const columns: ColumnDef<Feature>[] = [
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
  { id: 'signal_count', accessorKey: 'signal_count' },
  { id: 'shapers', accessorFn: r => r.shapers?.length ?? 0, enableSorting: false },
  { id: 'hill', accessorFn: r => r.hill_name || '' },
  { id: 'updated_at', accessorKey: 'updated_at' },
  { id: 'actor', accessorFn: r => r.last_actor || '', enableSorting: false },
]

// Backlog's filterFn handles the 'all'/'deleted' tabs itself, so the raw value is forwarded as-is.
const { table, vis, hideableCols } = useDataTable({
  data: features,
  columns,
  initialSort: [{ id: 'updated_at', desc: true }],
  statusFilter,
})

// ── Detail Sheet ──────────────────────────────────────────────────────────
interface FeatureFull extends Feature { solution: string | null; rabbit_holes: string | null; out_of_bounds: string | null }
interface FeatureEvent { seq: number; actor: string; summary: string; created_at: string }
interface Detail {
  feature: FeatureFull
  feedback: { id: string; content: string; source: string; classification: string }[]
  decisions: { id: string; verdict: string; rationale: string; decided_by: string | null; decided_at: string }[]
  pr_links: { id: string; repo: string; pr_number: number; pr_url: string; status: string }[]
  events: FeatureEvent[]
  attachments: { id: string; filename: string; kind: string }[]
}
const detail = ref<Detail | null>(null)
watch(selectedFeatureId, async (id) => {
  detail.value = null
  if (id) detail.value = await $fetch<Detail>(`/api/features/${id}`)
})
const open = computed({
  get: () => selectedFeatureId.value !== null,
  set: (v: boolean) => { if (!v) bike.clearFeature() },
})
</script>

<template>
  <div class="flex h-full flex-col gap-4 overflow-hidden p-4">
    <!-- Toolbar -->
    <div class="flex items-center justify-between gap-2">
      <StatusFilterTabs v-model="statusModel" :filters="FILTERS" />
      <ColumnToggle :columns="hideableCols" :labels="COL_LABEL" :button-text="t('backlog.columns')" />
    </div>

    <!-- Table -->
    <div class="flex-1 overflow-auto rounded-lg border">
      <Table class="table-fixed">
        <TableHeader class="bg-muted/50 sticky top-0">
          <TableRow>
            <TableHead class="w-10"><SelectAllCheckbox :table="table" :aria-label="t('backlog.selectAll')" /></TableHead>
            <TableHead><SortHeaderButton :table="table" column="title" :label="t('backlog.col.title')" /></TableHead>
            <TableHead v-if="vis('status')" class="w-28"><SortHeaderButton :table="table" column="status" :label="t('backlog.col.status')" /></TableHead>
            <TableHead v-if="vis('signal_count')" class="w-24 text-right"><SortHeaderButton :table="table" column="signal_count" :label="t('backlog.col.signals')" /></TableHead>
            <TableHead v-if="vis('shapers')" class="w-28">Shapers</TableHead>
            <TableHead v-if="vis('hill')" class="w-44"><SortHeaderButton :table="table" column="hill" label="Hill" /></TableHead>
            <TableHead v-if="vis('updated_at')" class="w-28 text-right"><SortHeaderButton :table="table" column="updated_at" :label="t('backlog.col.updated')" /></TableHead>
            <TableHead v-if="vis('actor')" class="w-32">{{ t('backlog.col.actor') }}</TableHead>
            <TableHead class="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow
            v-for="row in table.getRowModel().rows" :key="row.id"
            :data-state="row.getIsSelected() ? 'selected' : undefined"
            class="cursor-pointer"
            @click="bike.selectFeature(row.original.id)"
          >
            <TableCell @click.stop><SelectRowCheckbox :row="row" :aria-label="t('backlog.selectRow')" /></TableCell>
            <TableCell>
              <div class="flex items-center gap-2 font-medium">
                <span class="truncate">{{ row.original.title }}</span>
                <Badge v-if="row.original.stale" variant="outline" class="shrink-0 text-destructive border-destructive/30">{{ t('backlog.stale') }}</Badge>
              </div>
              <div class="truncate text-xs text-muted-foreground">{{ row.original.problem }}</div>
            </TableCell>
            <TableCell v-if="vis('status')"><StatusBadge :status="row.original.status" /></TableCell>
            <TableCell v-if="vis('signal_count')" class="text-right tabular-nums">{{ row.original.signal_count }}</TableCell>
            <TableCell v-if="vis('shapers')">
              <div v-if="row.original.shapers?.length" class="flex items-center">
                <UserAvatar v-for="s in row.original.shapers" :key="s.user_id" :name="s.name" :src="s.avatar_url" class="-mr-1.5 size-6 ring-2 ring-background" />
              </div>
              <span v-else class="text-muted-foreground">—</span>
            </TableCell>
            <TableCell v-if="vis('hill')" @click.stop>
              <NuxtLink v-if="row.original.hill_id" :to="`/hills/${row.original.hill_id}`" class="flex items-center gap-1 text-muted-foreground hover:text-foreground">
                <span class="truncate hover:underline">{{ row.original.hill_name }}</span>
                <ExternalLink class="size-3.5 shrink-0 opacity-60" />
              </NuxtLink>
              <span v-else class="text-muted-foreground">—</span>
            </TableCell>
            <TableCell v-if="vis('updated_at')" class="text-right text-muted-foreground whitespace-nowrap">{{ formatDate(row.original.updated_at, locale) }}</TableCell>
            <TableCell v-if="vis('actor')">
              <div class="flex items-center gap-1.5 text-sm"><UserAvatar :name="row.original.last_actor" /><span class="truncate text-muted-foreground">{{ row.original.last_actor || '—' }}</span></div>
            </TableCell>
            <TableCell @click.stop>
              <ResourceActionsMenu
                :is-deleted="row.original.status === 'deleted'" :restoring="restoring"
                :actions-label="t('backlog.actions')" :restore-label="t('backlog.restore')" :delete-label="t('backlog.delete')"
                @restore="restore(row.original.id)" @delete="askDelete(row.original)"
              />
            </TableCell>
          </TableRow>
          <TableRow v-if="!table.getRowModel().rows.length">
            <TableCell :colspan="8" class="h-24 text-center text-muted-foreground">{{ t('backlog.empty') }}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>

    <!-- Footer / pagination -->
    <DataTablePagination
      :table="table"
      :selected-label="t('backlog.rowsSelected', { n: table.getFilteredSelectedRowModel().rows.length, total: table.getFilteredRowModel().rows.length })"
      :rows-per-page-label="t('backlog.rowsPerPage')"
      :page-label="t('backlog.page', { current: table.getState().pagination.pageIndex + 1, total: Math.max(1, table.getPageCount()) })"
    />

    <!-- Detail Sheet -->
    <DetailSheet
      v-model:open="open" :ready="!!detail"
      :title="detail?.feature.title ?? ''" :open-page-to="`/features/${detail?.feature.id}`"
      :open-page-title="t('backlog.openFeaturePage')" :open-page-label="t('backlog.openPage')"
    >
      <FeatureDetail v-if="detail" :detail="detail" />
    </DetailSheet>

    <!-- Delete confirmation -->
    <ConfirmDeleteDialog
      v-model:open="confirmOpen" :deleting="deleting"
      :title="t('backlog.deleteTitle')"
      :description="t('backlog.deleteDesc', { title: toDelete?.title })"
      :cancel-label="t('backlog.cancel')" :confirm-label="deleting ? t('backlog.deleting') : t('backlog.delete')"
      @confirm="confirmDelete"
    />
  </div>
</template>
