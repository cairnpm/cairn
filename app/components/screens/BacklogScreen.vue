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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

interface Feature {
  id: string; title: string; problem: string; appetite: string | null
  status: string; stale: number; hill_id: string | null; hill_name: string | null
  signal_count: number; updated_at: string; last_actor: string | null
}

const bike = useBicycle()
const { statusFilter, selectedFeatureId } = bike
const { data: features } = await useFetch<Feature[]>('/api/features', { default: () => [], getCachedData: getFreshData })

function relTime(iso: string): string {
  const d = Date.parse(iso)
  if (Number.isNaN(d)) return '—'
  const s = Math.floor((Date.now() - d) / 1000)
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  if (s < 2592000) return `${Math.floor(s / 86400)}j`
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

const counts = computed(() => {
  const f = features.value
  const by = (s: string) => f.filter(x => x.status === s).length
  return { all: f.length, shaped: by('shaped'), bet: by('bet'), building: by('building'), done: by('done') }
})

// ── @tanstack/vue-table ───────────────────────────────────────────────────
function valueUpdater<T>(updaterOrValue: T | ((old: T) => T), ref: { value: T }) {
  ref.value = typeof updaterOrValue === 'function' ? (updaterOrValue as (o: T) => T)(ref.value) : updaterOrValue
}
const sorting = ref<SortingState>([{ id: 'updated_at', desc: true }])
const columnFilters = ref<ColumnFiltersState>([])
const columnVisibility = ref<VisibilityState>({})
const rowSelection = ref({})

const COL_LABEL: Record<string, string> = { title: 'Feature', status: 'Statut', signal_count: 'Signaux', hill: 'Hill', updated_at: 'Modifié', actor: 'Auteur' }
const columns: ColumnDef<Feature>[] = [
  { id: 'title', accessorKey: 'title', header: 'Feature', enableHiding: false },
  { id: 'status', accessorKey: 'status', header: 'Statut' },
  { id: 'signal_count', accessorKey: 'signal_count', header: 'Signaux' },
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

// Status filter Tabs drive the 'status' column filter.
watch(statusFilter, (v) => {
  table.getColumn('status')?.setFilterValue(v === 'all' ? undefined : v)
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
const PITCH = [
  { key: 'problem', label: 'Problème' },
  { key: 'solution', label: 'Solution esquissée' },
  { key: 'rabbit_holes', label: 'Rabbit holes' },
  { key: 'out_of_bounds', label: 'No-gos' },
] as const
</script>

<template>
  <div class="flex h-full flex-col gap-4 overflow-hidden p-4">
    <!-- Toolbar -->
    <div class="flex items-center justify-between gap-2">
      <Tabs :model-value="statusFilter" @update:model-value="bike.setStatusFilter(String($event))">
        <TabsList>
          <TabsTrigger value="all">Tous <span class="ml-1 text-muted-foreground tabular-nums">{{ counts.all }}</span></TabsTrigger>
          <TabsTrigger value="shaped">Shaped <span class="ml-1 text-muted-foreground tabular-nums">{{ counts.shaped }}</span></TabsTrigger>
          <TabsTrigger value="bet">Bet <span class="ml-1 text-muted-foreground tabular-nums">{{ counts.bet }}</span></TabsTrigger>
          <TabsTrigger value="building">Building <span class="ml-1 text-muted-foreground tabular-nums">{{ counts.building }}</span></TabsTrigger>
          <TabsTrigger value="done">Done <span class="ml-1 text-muted-foreground tabular-nums">{{ counts.done }}</span></TabsTrigger>
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
              <button class="inline-flex items-center gap-1 hover:text-foreground" @click="table.getColumn('title')?.toggleSorting()">Feature <component :is="sortIcon('title')" class="size-3.5 opacity-60" /></button>
            </TableHead>
            <TableHead v-if="vis('status')" class="w-28">
              <button class="inline-flex items-center gap-1 hover:text-foreground" @click="table.getColumn('status')?.toggleSorting()">Statut <component :is="sortIcon('status')" class="size-3.5 opacity-60" /></button>
            </TableHead>
            <TableHead v-if="vis('signal_count')" class="w-24 text-right">
              <button class="inline-flex items-center gap-1 hover:text-foreground" @click="table.getColumn('signal_count')?.toggleSorting()">Signaux <component :is="sortIcon('signal_count')" class="size-3.5 opacity-60" /></button>
            </TableHead>
            <TableHead v-if="vis('hill')" class="w-44">
              <button class="inline-flex items-center gap-1 hover:text-foreground" @click="table.getColumn('hill')?.toggleSorting()">Hill <component :is="sortIcon('hill')" class="size-3.5 opacity-60" /></button>
            </TableHead>
            <TableHead v-if="vis('updated_at')" class="w-20 text-right">
              <button class="inline-flex items-center gap-1 hover:text-foreground" @click="table.getColumn('updated_at')?.toggleSorting()">Modifié <component :is="sortIcon('updated_at')" class="size-3.5 opacity-60" /></button>
            </TableHead>
            <TableHead v-if="vis('actor')" class="w-12" />
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
                {{ row.original.title }}
                <Badge v-if="row.original.stale" variant="outline" class="text-destructive border-destructive/30">stale</Badge>
              </div>
              <div class="text-xs text-muted-foreground truncate max-w-md">{{ row.original.problem }}</div>
            </TableCell>
            <TableCell v-if="vis('status')"><StatusBadge :status="row.original.status" /></TableCell>
            <TableCell v-if="vis('signal_count')" class="text-right tabular-nums">{{ row.original.signal_count }}</TableCell>
            <TableCell v-if="vis('hill')" class="text-muted-foreground truncate">{{ row.original.hill_name || '—' }}</TableCell>
            <TableCell v-if="vis('updated_at')" class="text-right text-muted-foreground tabular-nums">{{ relTime(row.original.updated_at) }}</TableCell>
            <TableCell v-if="vis('actor')"><UserAvatar :name="row.original.last_actor" /></TableCell>
          </TableRow>
          <TableRow v-if="!table.getRowModel().rows.length">
            <TableCell :colspan="7" class="h-24 text-center text-muted-foreground">Aucune feature.</TableCell>
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
      <SheetContent class="flex w-full flex-col gap-0 p-0 sm:max-w-[min(92vw,1100px)]">
        <template v-if="detail">
          <!-- Header (border-b) -->
          <SheetHeader class="gap-2 border-b px-6 py-4">
            <SheetTitle class="text-base leading-snug">{{ detail.feature.title }}</SheetTitle>
            <div class="flex flex-wrap items-center gap-1.5">
              <StatusBadge :status="detail.feature.status" />
              <Badge variant="outline">{{ detail.feature.appetite || '—' }}</Badge>
              <Badge v-if="detail.feature.hill_name" variant="secondary">{{ detail.feature.hill_name }}</Badge>
            </div>
          </SheetHeader>

          <!-- Body: two columns -->
          <div class="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[1fr_360px]">
            <!-- Left column: pitch + signaux + décisions + PR -->
            <ScrollArea class="min-h-0">
              <div class="flex flex-col gap-6 p-6 text-sm">
              <div v-for="p in PITCH" :key="p.key" v-show="detail.feature[p.key]">
                <div class="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{{ p.label }}</div>
                <p class="leading-relaxed">{{ detail.feature[p.key] }}</p>
              </div>
              <div v-if="detail.attachments.length">
                <div class="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Pièces jointes</div>
                <div class="flex flex-wrap gap-2">
                  <a v-for="a in detail.attachments" :key="a.id" :href="`/api/attachments/${a.id}`" target="_blank">
                    <img v-if="a.kind === 'image'" :src="`/api/attachments/${a.id}`" :title="a.filename" class="size-16 rounded-md border object-cover">
                    <Badge v-else variant="outline" class="gap-1">📄 {{ a.filename }}</Badge>
                  </a>
                </div>
              </div>
              <div v-if="detail.feedback.length">
                <div class="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Signaux ({{ detail.feedback.length }})</div>
                <div class="flex flex-col gap-2">
                  <div v-for="fb in detail.feedback" :key="fb.id" class="rounded-md border bg-muted/40 p-3">
                    <div class="font-medium">{{ fb.content }}</div>
                    <div class="mt-1 text-xs text-muted-foreground">{{ fb.source }} · {{ fb.classification }}</div>
                  </div>
                </div>
              </div>
              <div v-if="detail.decisions.length">
                <div class="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Décisions</div>
                <div v-for="d in detail.decisions" :key="d.id" class="mb-2 rounded-md border bg-muted/40 p-3">
                  <div class="mb-1 flex items-center gap-2"><Badge variant="secondary" class="capitalize">{{ d.verdict }}</Badge><span class="text-xs text-muted-foreground">{{ relTime(d.decided_at) }}</span></div>
                  <p>{{ d.rationale }}</p>
                  <div class="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground"><UserAvatar :name="d.decided_by" class="size-4" />{{ d.decided_by }}</div>
                </div>
              </div>
              <div v-if="detail.pr_links.length">
                <div class="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">PR GitHub</div>
                <a v-for="p in detail.pr_links" :key="p.id" :href="p.pr_url" target="_blank" class="flex items-center gap-1.5 font-mono text-xs text-muted-foreground hover:text-foreground">
                  <ExternalLink class="size-3" />{{ p.repo }}#{{ p.pr_number }} · {{ p.status }}
                </a>
              </div>
              </div>
            </ScrollArea>

            <!-- Right column: activity history -->
            <aside class="min-h-0 border-t bg-muted/20 md:border-l md:border-t-0">
              <ScrollArea class="h-full">
                <div class="p-6">
              <div class="mb-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">Activité ({{ detail.events.length }})</div>
              <div class="relative flex flex-col gap-4">
                <div v-for="(e, i) in detail.events" :key="e.seq" class="flex gap-2.5">
                  <div class="relative flex flex-col items-center">
                    <UserAvatar :name="e.actor" class="size-6 shrink-0" />
                    <div v-if="i < detail.events.length - 1" class="mt-1 w-px flex-1 bg-border" />
                  </div>
                  <div class="min-w-0 pb-1 text-sm">
                    <div class="leading-snug">{{ e.summary }}</div>
                    <div class="mt-0.5 text-xs text-muted-foreground">{{ relTime(e.created_at) }}</div>
                  </div>
                </div>
                <div v-if="!detail.events.length" class="text-sm text-muted-foreground">Aucune activité.</div>
              </div>
                </div>
              </ScrollArea>
            </aside>
          </div>
        </template>
      </SheetContent>
    </Sheet>
  </div>
</template>
