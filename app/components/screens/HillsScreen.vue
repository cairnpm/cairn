<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { type ColumnDef } from '@tanstack/vue-table'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDate } from '~/utils/time'
import type { HillDetailData } from '~/types/hill'

const { t, locale } = useUiLang()

interface HillRow { id: string; name: string; starts_at: string | null; ends_at: string | null; status: string; total: number; done: number }

const { data: hills } = await useApiData<HillRow[]>(qk.hills, '/api/hills', { default: () => [] })

function shortId(id: string) { const m = id.match(/hill-(\d+)/); return m ? `H-${m[1]}` : id.slice(0, 4).toUpperCase() }
const pct = (h: { total: number; done: number }) => h.total ? Math.round((h.done / h.total) * 100) : 0

// Quick-view Sheet (click a row); the full page is /hills/[id].
const selectedId = ref<string | null>(null)
const detail = ref<HillDetailData | null>(null)
watch(selectedId, async (id) => {
  detail.value = null
  if (id) detail.value = await $fetch<HillDetailData>(`/api/hills/${id}`)
})
const sheetOpen = computed({
  get: () => selectedId.value !== null,
  set: (v: boolean) => { if (!v) selectedId.value = null },
})
const featPeek = ref<string | null>(null)

const statusFilter = useState<string>('bike-hills-filter', () => 'all')
const counts = computed(() => {
  const h = hills.value
  const by = (s: string) => h.filter(x => x.status === s).length
  return { all: h.length, active: by('active'), planned: by('planned'), closed: by('closed') }
})
const FILTERS = computed(() => [
  { key: 'all', label: t('hill.filter.all'), n: counts.value.all },
  { key: 'active', label: t('hill.filter.active'), n: counts.value.active },
  { key: 'planned', label: t('hill.filter.planned'), n: counts.value.planned },
  { key: 'closed', label: t('hill.filter.closed'), n: counts.value.closed },
])

const COL_LABEL = computed<Record<string, string>>(() => ({ name: 'Hill', status: t('hill.col.status'), progress: t('hill.col.progress'), period: t('hill.col.period') }))
const columns: ColumnDef<HillRow>[] = [
  { id: 'name', accessorKey: 'name', enableHiding: false },
  { id: 'status', accessorKey: 'status', filterFn: (row, _id, val) => row.getValue('status') === val },
  { id: 'progress', accessorFn: r => (r.total ? r.done / r.total : 0) },
  { id: 'period', accessorFn: r => r.starts_at || '' },
]

const { table, vis, hideableCols } = useDataTable({
  data: hills,
  columns,
  initialSort: [{ id: 'period', desc: true }],
  statusFilter,
  mapStatusValue: v => (v === 'all' ? undefined : v),
})
</script>

<template>
  <div class="flex h-full flex-col gap-4 overflow-hidden p-4">
    <!-- Toolbar -->
    <div class="flex items-center justify-between gap-2">
      <StatusFilterTabs v-model="statusFilter" :filters="FILTERS" />
      <ColumnToggle :columns="hideableCols" :labels="COL_LABEL" :button-text="t('hill.columns')" />
    </div>

    <!-- Table -->
    <div class="flex-1 overflow-auto rounded-lg border">
      <Table>
        <TableHeader class="bg-muted/50 sticky top-0">
          <TableRow>
            <TableHead class="w-10"><SelectAllCheckbox :table="table" :aria-label="t('hill.selectAll')" /></TableHead>
            <TableHead><SortHeaderButton :table="table" column="name" label="Hill" /></TableHead>
            <TableHead v-if="vis('status')" class="w-28"><SortHeaderButton :table="table" column="status" :label="t('hill.col.status')" /></TableHead>
            <TableHead v-if="vis('progress')" class="w-48"><SortHeaderButton :table="table" column="progress" :label="t('hill.col.progress')" /></TableHead>
            <TableHead v-if="vis('period')" class="w-44"><SortHeaderButton :table="table" column="period" :label="t('hill.col.period')" /></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="row in table.getRowModel().rows" :key="row.id" :data-state="row.getIsSelected() ? 'selected' : undefined" class="cursor-pointer" @click="selectedId = row.original.id">
            <TableCell @click.stop><SelectRowCheckbox :row="row" :aria-label="t('hill.selectRow')" /></TableCell>
            <TableCell>
              <span class="mr-2 font-mono text-xs text-muted-foreground">{{ shortId(row.original.id) }}</span>
              <span class="font-medium">{{ row.original.name }}</span>
            </TableCell>
            <TableCell v-if="vis('status')"><StatusBadge :status="row.original.status" /></TableCell>
            <TableCell v-if="vis('progress')">
              <div class="flex items-center gap-2">
                <div class="h-1.5 w-24 overflow-hidden rounded-full bg-muted"><div class="h-full rounded-full bg-primary" :style="{ width: pct(row.original) + '%' }" /></div>
                <span class="text-xs text-muted-foreground tabular-nums">{{ row.original.done }}/{{ row.original.total }}</span>
              </div>
            </TableCell>
            <TableCell v-if="vis('period')" class="text-xs text-muted-foreground whitespace-nowrap">{{ formatDate(row.original.starts_at, locale) }} → {{ formatDate(row.original.ends_at, locale) }}</TableCell>
          </TableRow>
          <TableRow v-if="!table.getRowModel().rows.length">
            <TableCell :colspan="5" class="h-24 text-center text-muted-foreground">{{ t('hill.emptyList') }}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>

    <!-- Footer / pagination -->
    <DataTablePagination
      :table="table"
      :selected-label="t('hill.selectedCount', { n: table.getFilteredSelectedRowModel().rows.length, total: table.getFilteredRowModel().rows.length })"
      :rows-per-page-label="t('hill.rowsPerPage')"
      :page-label="t('hill.pageOf', { n: table.getState().pagination.pageIndex + 1, total: Math.max(1, table.getPageCount()) })"
    />

    <!-- Quick-view Sheet -->
    <DetailSheet
      v-model:open="sheetOpen" :ready="!!detail"
      :title="detail?.hill.name ?? ''" :open-page-to="`/hills/${detail?.hill.id}`"
      :open-page-title="t('hill.openHillPage')" :open-page-label="t('hill.openPage')"
    >
      <HillDetail v-if="detail" :data="detail" @select-feature="featPeek = $event" />
    </DetailSheet>

    <!-- Feature peek — from the Sheet, open the feature as a modal Dialog -->
    <FeatureDetailOverlay v-model:feature-id="featPeek" mode="dialog" />
  </div>
</template>
