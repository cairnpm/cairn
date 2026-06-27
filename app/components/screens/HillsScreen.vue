<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  type ColumnDef, type ColumnFiltersState, type SortingState, type VisibilityState,
  getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, useVueTable,
} from '@tanstack/vue-table'
import {
  ArrowDown, ArrowUp, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight,
  ChevronsUpDown, Columns3, ExternalLink,
} from 'lucide-vue-next'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { HillDetailData } from '~/types/hill'

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
function keepSheetOpen(e: any) {
  const t = (e?.detail?.originalEvent?.target ?? e?.target) as HTMLElement | null
  if (t?.closest?.('[role="menu"],[role="dialog"],[role="alertdialog"],[data-reka-popper-content-wrapper]')) e.preventDefault()
}

const statusFilter = useState<string>('bike-hills-filter', () => 'all')
const counts = computed(() => {
  const h = hills.value
  const by = (s: string) => h.filter(x => x.status === s).length
  return { all: h.length, active: by('active'), planned: by('planned'), closed: by('closed') }
})
const FILTERS = computed(() => [
  { key: 'all', label: 'Tous', n: counts.value.all },
  { key: 'active', label: 'Actifs', n: counts.value.active },
  { key: 'planned', label: 'Planifiés', n: counts.value.planned },
  { key: 'closed', label: 'Clos', n: counts.value.closed },
])

function valueUpdater<T>(u: T | ((old: T) => T), r: { value: T }) {
  r.value = typeof u === 'function' ? (u as (o: T) => T)(r.value) : u
}
const sorting = ref<SortingState>([{ id: 'period', desc: true }])
const columnFilters = ref<ColumnFiltersState>([])
const columnVisibility = ref<VisibilityState>({})
const rowSelection = ref({})

const COL_LABEL: Record<string, string> = { name: 'Hill', status: 'Statut', progress: 'Avancement', period: 'Période' }
const columns: ColumnDef<HillRow>[] = [
  { id: 'name', accessorKey: 'name', header: 'Hill', enableHiding: false },
  { id: 'status', accessorKey: 'status', header: 'Statut', filterFn: (row, _id, val) => row.getValue('status') === val },
  { id: 'progress', accessorFn: r => (r.total ? r.done / r.total : 0), header: 'Avancement' },
  { id: 'period', accessorFn: r => r.starts_at || '', header: 'Période' },
]

const table = useVueTable({
  get data() { return hills.value },
  columns,
  state: {
    get sorting() { return sorting.value },
    get columnFilters() { return columnFilters.value },
    get columnVisibility() { return columnVisibility.value },
    get rowSelection() { return rowSelection.value },
  },
  getRowId: row => row.id,
  enableRowSelection: true,
  onSortingChange: u => valueUpdater(u, sorting),
  onColumnFiltersChange: u => valueUpdater(u, columnFilters),
  onColumnVisibilityChange: u => valueUpdater(u, columnVisibility),
  onRowSelectionChange: u => valueUpdater(u, rowSelection),
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
  getFilteredRowModel: getFilteredRowModel(),
  getPaginationRowModel: getPaginationRowModel(),
  initialState: { pagination: { pageSize: 10 } },
})

watch(statusFilter, (v) => {
  table.getColumn('status')?.setFilterValue(v === 'all' ? undefined : v)
}, { immediate: true })

const hideableCols = computed(() => table.getAllColumns().filter(c => c.getCanHide()))
function sortIcon(id: string) {
  const s = table.getColumn(id)?.getIsSorted()
  return s === 'asc' ? ArrowUp : s === 'desc' ? ArrowDown : ChevronsUpDown
}
function vis(id: string) { return table.getColumn(id)?.getIsVisible() ?? true }
</script>

<template>
  <div class="flex h-full flex-col gap-4 overflow-hidden p-4">
    <!-- Toolbar -->
    <div class="flex items-center justify-between gap-2">
      <Tabs :model-value="statusFilter" @update:model-value="(v) => statusFilter = String(v)">
        <TabsList>
          <TabsTrigger v-for="f in FILTERS" :key="f.key" :value="f.key" class="group gap-1.5">
            {{ f.label }}
            <Badge variant="secondary" class="h-5 min-w-5 justify-center rounded-full border-transparent bg-background px-1.5 tabular-nums text-foreground group-data-[state=active]:bg-muted">{{ f.n }}</Badge>
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button variant="outline" size="sm"><Columns3 class="size-4" /> Colonnes <ChevronsUpDown class="size-4 opacity-50" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="w-40">
          <DropdownMenuCheckboxItem
            v-for="col in hideableCols" :key="col.id"
            class="capitalize" :model-value="col.getIsVisible()"
            @update:model-value="(v: boolean) => col.toggleVisibility(!!v)"
          >{{ COL_LABEL[col.id] || col.id }}</DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>

    <!-- Table -->
    <div class="flex-1 overflow-auto rounded-lg border">
      <Table>
        <TableHeader class="bg-muted/50 sticky top-0">
          <TableRow>
            <TableHead class="w-10">
              <Checkbox :model-value="table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')" aria-label="Tout sélectionner" @update:model-value="(v: boolean) => table.toggleAllPageRowsSelected(!!v)" />
            </TableHead>
            <TableHead>
              <button class="inline-flex items-center gap-1 hover:text-foreground" @click="table.getColumn('name')?.toggleSorting()">Hill <component :is="sortIcon('name')" class="size-3.5 opacity-60" /></button>
            </TableHead>
            <TableHead v-if="vis('status')" class="w-28">
              <button class="inline-flex items-center gap-1 hover:text-foreground" @click="table.getColumn('status')?.toggleSorting()">Statut <component :is="sortIcon('status')" class="size-3.5 opacity-60" /></button>
            </TableHead>
            <TableHead v-if="vis('progress')" class="w-48">
              <button class="inline-flex items-center gap-1 hover:text-foreground" @click="table.getColumn('progress')?.toggleSorting()">Avancement <component :is="sortIcon('progress')" class="size-3.5 opacity-60" /></button>
            </TableHead>
            <TableHead v-if="vis('period')" class="w-44">
              <button class="inline-flex items-center gap-1 hover:text-foreground" @click="table.getColumn('period')?.toggleSorting()">Période <component :is="sortIcon('period')" class="size-3.5 opacity-60" /></button>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="row in table.getRowModel().rows" :key="row.id" :data-state="row.getIsSelected() ? 'selected' : undefined" class="cursor-pointer" @click="selectedId = row.original.id">
            <TableCell @click.stop>
              <Checkbox :model-value="row.getIsSelected()" aria-label="Sélectionner la ligne" @update:model-value="(v: boolean) => row.toggleSelected(!!v)" />
            </TableCell>
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
            <TableCell v-if="vis('period')" class="text-xs text-muted-foreground">{{ row.original.starts_at || '—' }} → {{ row.original.ends_at || '—' }}</TableCell>
          </TableRow>
          <TableRow v-if="!table.getRowModel().rows.length">
            <TableCell :colspan="5" class="h-24 text-center text-muted-foreground">Aucune hill.</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>

    <!-- Footer / pagination -->
    <div class="flex items-center justify-between gap-4 text-sm">
      <div class="text-muted-foreground">{{ table.getFilteredSelectedRowModel().rows.length }} / {{ table.getFilteredRowModel().rows.length }} hill(s) sélectionnée(s)</div>
      <div class="flex items-center gap-6">
        <div class="flex items-center gap-2">
          <span class="text-muted-foreground hidden sm:inline">Lignes / page</span>
          <Select :model-value="String(table.getState().pagination.pageSize)" @update:model-value="(v: any) => table.setPageSize(Number(v))">
            <SelectTrigger size="sm" class="w-16"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem v-for="n in [10, 20, 30, 50]" :key="n" :value="String(n)">{{ n }}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div class="text-muted-foreground tabular-nums">Page {{ table.getState().pagination.pageIndex + 1 }} / {{ Math.max(1, table.getPageCount()) }}</div>
        <div class="flex items-center gap-1">
          <Button variant="outline" size="icon" class="size-8" :disabled="!table.getCanPreviousPage()" @click="table.setPageIndex(0)"><ChevronFirst class="size-4" /></Button>
          <Button variant="outline" size="icon" class="size-8" :disabled="!table.getCanPreviousPage()" @click="table.previousPage()"><ChevronLeft class="size-4" /></Button>
          <Button variant="outline" size="icon" class="size-8" :disabled="!table.getCanNextPage()" @click="table.nextPage()"><ChevronRight class="size-4" /></Button>
          <Button variant="outline" size="icon" class="size-8" :disabled="!table.getCanNextPage()" @click="table.setPageIndex(table.getPageCount() - 1)"><ChevronLast class="size-4" /></Button>
        </div>
      </div>
    </div>

    <!-- Quick-view Sheet -->
    <Sheet v-model:open="sheetOpen">
      <SheetContent class="flex w-full flex-col gap-0 p-0 sm:max-w-[min(92vw,1100px)]" @interact-outside="keepSheetOpen" @focus-outside="keepSheetOpen">
        <template v-if="detail">
          <SheetTitle class="sr-only">{{ detail.hill.name }}</SheetTitle>
          <NuxtLink
            :to="`/hills/${detail.hill.id}`" title="Ouvrir la page du hill"
            class="ring-offset-background focus:ring-ring absolute top-4 right-12 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden"
          >
            <ExternalLink class="size-4" />
            <span class="sr-only">Ouvrir la page</span>
          </NuxtLink>
          <HillDetail :data="detail" @select-feature="featPeek = $event" />
        </template>
      </SheetContent>
    </Sheet>

    <!-- Feature peek — from the Sheet, open the feature as a modal Dialog -->
    <FeatureDetailOverlay v-model:feature-id="featPeek" mode="dialog" />
  </div>
</template>
