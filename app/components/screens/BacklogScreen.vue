<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  type ColumnDef, type ColumnFiltersState, type SortingState, type VisibilityState,
  getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, useVueTable,
} from '@tanstack/vue-table'
import {
  ArrowDown, ArrowUp, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight,
  ChevronsUpDown, Columns3, ExternalLink, MoreHorizontal, RotateCcw, Trash2,
} from 'lucide-vue-next'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { keepOverlayOpen } from '~/utils/overlay'
import { formatDate } from '~/utils/time'

interface Feature {
  id: string; title: string; problem: string; appetite: string | null
  status: string; stale: number; hill_id: string | null; hill_name: string | null
  signal_count: number; updated_at: string; last_actor: string | null
  shapers: { user_id: string; name: string; avatar_url: string | null }[]
}

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
    await mutate(`/api/features/${id}`, { method: 'DELETE', invalidates: [qk.features, qk.overview], success: 'Feature supprimée' })
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
  { key: 'all', label: 'Tous', n: counts.value.all },
  { key: 'shaped', label: 'Shaped', n: counts.value.shaped },
  { key: 'bet', label: 'Bet', n: counts.value.bet },
  { key: 'building', label: 'Building', n: counts.value.building },
  { key: 'done', label: 'Done', n: counts.value.done },
  { key: 'deleted', label: 'Supprimées', n: counts.value.deleted },
])

// Restore a soft-deleted feature.
const restoring = ref(false)
async function restore(id: string) {
  if (restoring.value) return
  restoring.value = true
  try { await mutate(`/api/features/${id}/restore`, { invalidates: [qk.features, qk.overview], success: 'Feature réactivée' }) } finally { restoring.value = false }
}

// ── @tanstack/vue-table ───────────────────────────────────────────────────
function valueUpdater<T>(updaterOrValue: T | ((old: T) => T), ref: { value: T }) {
  ref.value = typeof updaterOrValue === 'function' ? (updaterOrValue as (o: T) => T)(ref.value) : updaterOrValue
}
const sorting = ref<SortingState>([{ id: 'updated_at', desc: true }])
const columnFilters = ref<ColumnFiltersState>([])
const columnVisibility = ref<VisibilityState>({})
const rowSelection = ref({})

const COL_LABEL: Record<string, string> = { title: 'Feature', status: 'Statut', signal_count: 'Signaux', shapers: 'Shapers', hill: 'Hill', updated_at: 'Modifié', actor: 'Auteur' }
const columns: ColumnDef<Feature>[] = [
  { id: 'title', accessorKey: 'title', header: 'Feature', enableHiding: false },
  {
    id: 'status', accessorKey: 'status', header: 'Statut',
    filterFn: (row, _id, val) => {
      const s = row.getValue('status') as string
      if (val === 'all') return s !== 'deleted'
      if (val === 'deleted') return s === 'deleted'
      return s === val
    },
  },
  { id: 'signal_count', accessorKey: 'signal_count', header: 'Signaux' },
  { id: 'shapers', accessorFn: r => r.shapers?.length ?? 0, header: 'Shapers', enableSorting: false },
  { id: 'hill', accessorFn: r => r.hill_name || '', header: 'Hill' },
  { id: 'updated_at', accessorKey: 'updated_at', header: 'Modifié' },
  { id: 'actor', accessorFn: r => r.last_actor || '', header: 'Auteur', enableSorting: false },
]

const table = useVueTable({
  get data() { return features.value },
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

// Status filter Tabs drive the 'status' column filter (custom filterFn handles 'all'/'deleted').
watch(statusFilter, (v) => {
  table.getColumn('status')?.setFilterValue(v)
}, { immediate: true })

const hideableCols = computed(() => table.getAllColumns().filter(c => c.getCanHide()))
function sortIcon(id: string) {
  const s = table.getColumn(id)?.getIsSorted()
  return s === 'asc' ? ArrowUp : s === 'desc' ? ArrowDown : ChevronsUpDown
}
function vis(id: string) { return table.getColumn(id)?.getIsVisible() ?? true }

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
      <Tabs :model-value="statusFilter" @update:model-value="bike.setStatusFilter(String($event))">
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
      <Table class="table-fixed">
        <TableHeader class="bg-muted/50 sticky top-0">
          <TableRow>
            <TableHead class="w-10">
              <Checkbox :model-value="table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')" aria-label="Tout sélectionner" @update:model-value="(v: boolean) => table.toggleAllPageRowsSelected(!!v)" />
            </TableHead>
            <TableHead>
              <button class="inline-flex items-center gap-1 hover:text-foreground" @click="table.getColumn('title')?.toggleSorting()">Feature <component :is="sortIcon('title')" class="size-3.5 opacity-60" /></button>
            </TableHead>
            <TableHead v-if="vis('status')" class="w-28">
              <button class="inline-flex items-center gap-1 hover:text-foreground" @click="table.getColumn('status')?.toggleSorting()">Statut <component :is="sortIcon('status')" class="size-3.5 opacity-60" /></button>
            </TableHead>
            <TableHead v-if="vis('signal_count')" class="w-24 text-right">
              <button class="inline-flex items-center gap-1 hover:text-foreground" @click="table.getColumn('signal_count')?.toggleSorting()">Signaux <component :is="sortIcon('signal_count')" class="size-3.5 opacity-60" /></button>
            </TableHead>
            <TableHead v-if="vis('shapers')" class="w-28">Shapers</TableHead>
            <TableHead v-if="vis('hill')" class="w-44">
              <button class="inline-flex items-center gap-1 hover:text-foreground" @click="table.getColumn('hill')?.toggleSorting()">Hill <component :is="sortIcon('hill')" class="size-3.5 opacity-60" /></button>
            </TableHead>
            <TableHead v-if="vis('updated_at')" class="w-28 text-right">
              <button class="inline-flex items-center gap-1 hover:text-foreground" @click="table.getColumn('updated_at')?.toggleSorting()">Modifié <component :is="sortIcon('updated_at')" class="size-3.5 opacity-60" /></button>
            </TableHead>
            <TableHead v-if="vis('actor')" class="w-32">Auteur</TableHead>
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
            <TableCell @click.stop>
              <Checkbox :model-value="row.getIsSelected()" aria-label="Sélectionner la ligne" @update:model-value="(v: boolean) => row.toggleSelected(!!v)" />
            </TableCell>
            <TableCell>
              <div class="flex items-center gap-2 font-medium">
                <span class="truncate">{{ row.original.title }}</span>
                <Badge v-if="row.original.stale" variant="outline" class="shrink-0 text-destructive border-destructive/30">stale</Badge>
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
            <TableCell v-if="vis('updated_at')" class="text-right text-muted-foreground whitespace-nowrap">{{ formatDate(row.original.updated_at) }}</TableCell>
            <TableCell v-if="vis('actor')">
              <div class="flex items-center gap-1.5 text-sm"><UserAvatar :name="row.original.last_actor" /><span class="truncate text-muted-foreground">{{ row.original.last_actor || '—' }}</span></div>
            </TableCell>
            <TableCell @click.stop>
              <DropdownMenu>
                <DropdownMenuTrigger as-child>
                  <Button variant="ghost" size="icon" class="size-8 text-muted-foreground"><MoreHorizontal class="size-4" /><span class="sr-only">Actions</span></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem v-if="row.original.status === 'deleted'" :disabled="restoring" @click="restore(row.original.id)"><RotateCcw /> Réactiver</DropdownMenuItem>
                  <DropdownMenuItem v-else variant="destructive" @click="askDelete(row.original)"><Trash2 /> Supprimer</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
          <TableRow v-if="!table.getRowModel().rows.length">
            <TableCell :colspan="8" class="h-24 text-center text-muted-foreground">Aucune feature.</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>

    <!-- Footer / pagination -->
    <div class="flex items-center justify-between gap-4 text-sm">
      <div class="text-muted-foreground">
        {{ table.getFilteredSelectedRowModel().rows.length }} / {{ table.getFilteredRowModel().rows.length }} ligne(s) sélectionnée(s)
      </div>
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

    <!-- Detail Sheet -->
    <Sheet v-model:open="open">
      <SheetContent class="flex w-full flex-col gap-0 p-0 sm:max-w-[min(92vw,1100px)]" @interact-outside="keepOverlayOpen" @focus-outside="keepOverlayOpen">
        <template v-if="detail">
          <SheetTitle class="sr-only">{{ detail.feature.title }}</SheetTitle>
          <NuxtLink
            :to="`/features/${detail.feature.id}`"
            title="Ouvrir la page de la feature"
            class="ring-offset-background focus:ring-ring absolute top-4 right-12 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden"
          >
            <ExternalLink class="size-4" />
            <span class="sr-only">Ouvrir la page</span>
          </NuxtLink>
          <FeatureDetail :detail="detail" />
        </template>
      </SheetContent>
    </Sheet>

    <!-- Delete confirmation -->
    <AlertDialog v-model:open="confirmOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer cette feature ?</AlertDialogTitle>
          <AlertDialogDescription>
            « {{ toDelete?.title }} » passera au statut « Supprimée ». Son historique est conservé et tu pourras la réactiver depuis l'onglet « Supprimées ».
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel :disabled="deleting">Annuler</AlertDialogCancel>
          <AlertDialogAction class="bg-destructive text-white hover:bg-destructive/90" :disabled="deleting" @click="confirmDelete">{{ deleting ? 'Suppression…' : 'Supprimer' }}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
