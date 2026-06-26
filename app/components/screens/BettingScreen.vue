<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  type ColumnDef, type ColumnFiltersState, type SortingState, type VisibilityState,
  getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, useVueTable,
} from '@tanstack/vue-table'
import {
  ArrowDown, ArrowUp, Check, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight,
  ChevronsUpDown, Columns3, ExternalLink, MoreHorizontal, Plus, RotateCcw, Trash2,
} from 'lucide-vue-next'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import type { BettingTableDetailData } from '~/types/betting'
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

interface TableRowT {
  id: string; title: string; status: string; owner_name: string | null
  hill_id: string | null; hill_name: string | null; generated_at: string; validated_at: string | null; validated_by: string | null
  candidate_count: number; voter_count: number; vote_count: number
}

const bike = useBicycle()
const { role } = bike
const { data: tables, refresh } = await useFetch<TableRowT[]>('/api/betting-tables', { default: () => [], getCachedData: getFreshData })
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
    await $fetch(`/api/betting-tables/${id}`, { method: 'DELETE' })
    if (selectedId.value === id) selectedId.value = null
    await refresh()
  } finally { deleting.value = false; confirmOpen.value = false; toDelete.value = null }
}

async function createTable() {
  if (creating.value) return
  creating.value = true
  try {
    const r = await $fetch<{ id: string }>('/api/betting-tables', { method: 'POST', body: { title: '' } })
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
const voting = ref(false)
const iVoted = (c: { voters: string[] }) => c.voters.includes(author.value)
async function vote(candidateId: string) {
  if (voting.value || detail.value?.table.status !== 'open') return
  voting.value = true
  try {
    await $fetch(`/api/betting-tables/${selectedId.value}/votes`, { method: 'POST', body: { candidate_id: candidateId } })
    await Promise.all([loadDetail(), refresh()])
  } finally { voting.value = false }
}

// Menus/dialogs opened from inside the Sheet portal their content outside the focus trap; without
// this the Sheet would dismiss itself when they are clicked. Keep it open for those interactions.
function keepSheetOpenOnMenu(e: any) {
  const t = (e?.detail?.originalEvent?.target ?? e?.target) as HTMLElement | null
  if (t?.closest?.('[role="menu"],[role="dialog"],[role="alertdialog"],[data-reka-popper-content-wrapper],[data-radix-popper-content-wrapper]')) e.preventDefault()
}

// Validate from the Sheet (owner). Mirrors the dedicated page.
const validateOpen = ref(false)
// Peek a candidate's feature as a modal Dialog (we're already in a Sheet).
const featPeek = ref<string | null>(null)
async function onValidated() {
  await Promise.all([loadDetail(), refresh()])
}

// Reactivate a soft-deleted table.
const restoring = ref(false)
async function restore(id: string) {
  if (restoring.value) return
  restoring.value = true
  try { await $fetch(`/api/betting-tables/${id}/restore`, { method: 'POST' }); await refresh() } finally { restoring.value = false }
}

function relTime(iso: string): string {
  const d = Date.parse(iso?.includes?.('T') ? iso : (iso || '').replace(' ', 'T') + 'Z')
  if (Number.isNaN(d)) return '—'
  const s = Math.floor((Date.now() - d) / 1000)
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  if (s < 2592000) return `${Math.floor(s / 86400)}j`
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

const statusFilter = useState<string>('bike-betting-filter', () => 'all')
const counts = computed(() => {
  const t = tables.value
  const by = (s: string) => t.filter(x => x.status === s).length
  const deleted = by('deleted')
  return { all: t.length - deleted, open: by('open'), validated: by('validated'), cancelled: by('cancelled'), deleted }
})
const FILTERS = computed(() => [
  { key: 'all', label: 'Toutes', n: counts.value.all },
  { key: 'open', label: 'Ouvertes', n: counts.value.open },
  { key: 'validated', label: 'Validées', n: counts.value.validated },
  { key: 'cancelled', label: 'Annulées', n: counts.value.cancelled },
  { key: 'deleted', label: 'Supprimées', n: counts.value.deleted },
])

function valueUpdater<T>(u: T | ((old: T) => T), r: { value: T }) {
  r.value = typeof u === 'function' ? (u as (o: T) => T)(r.value) : u
}
const sorting = ref<SortingState>([{ id: 'generated_at', desc: true }])
const columnFilters = ref<ColumnFiltersState>([])
const columnVisibility = ref<VisibilityState>({})
const rowSelection = ref({})

const COL_LABEL: Record<string, string> = { title: 'Table', status: 'Statut', candidate_count: 'Candidats', vote_count: 'Votes', owner: 'Owner', generated_at: 'Créée' }
const columns: ColumnDef<TableRowT>[] = [
  { id: 'title', accessorKey: 'title', header: 'Table', enableHiding: false },
  {
    id: 'status', accessorKey: 'status', header: 'Statut',
    filterFn: (row, _id, val) => {
      const s = row.getValue('status') as string
      if (val === 'all') return s !== 'deleted'
      if (val === 'deleted') return s === 'deleted'
      return s === val
    },
  },
  { id: 'candidate_count', accessorKey: 'candidate_count', header: 'Candidats' },
  { id: 'vote_count', accessorKey: 'vote_count', header: 'Votes' },
  { id: 'owner', accessorFn: r => r.owner_name || '', header: 'Owner', enableSorting: false },
  { id: 'generated_at', accessorKey: 'generated_at', header: 'Créée' },
]

const table = useVueTable({
  get data() { return tables.value },
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
  table.getColumn('status')?.setFilterValue(v)
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
      <div class="flex items-center gap-2">
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
        <Button size="sm" :disabled="creating" @click="createTable"><Plus class="size-4" /> {{ creating ? 'Génération…' : 'Nouvelle table' }}</Button>
      </div>
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
              <button class="inline-flex items-center gap-1 hover:text-foreground" @click="table.getColumn('title')?.toggleSorting()">Table <component :is="sortIcon('title')" class="size-3.5 opacity-60" /></button>
            </TableHead>
            <TableHead v-if="vis('status')" class="w-32">
              <button class="inline-flex items-center gap-1 hover:text-foreground" @click="table.getColumn('status')?.toggleSorting()">Statut <component :is="sortIcon('status')" class="size-3.5 opacity-60" /></button>
            </TableHead>
            <TableHead v-if="vis('candidate_count')" class="w-28 text-right">
              <button class="inline-flex items-center gap-1 hover:text-foreground" @click="table.getColumn('candidate_count')?.toggleSorting()">Candidats <component :is="sortIcon('candidate_count')" class="size-3.5 opacity-60" /></button>
            </TableHead>
            <TableHead v-if="vis('vote_count')" class="w-24 text-right">
              <button class="inline-flex items-center gap-1 hover:text-foreground" @click="table.getColumn('vote_count')?.toggleSorting()">Votes <component :is="sortIcon('vote_count')" class="size-3.5 opacity-60" /></button>
            </TableHead>
            <TableHead v-if="vis('owner')" class="w-32">Owner</TableHead>
            <TableHead v-if="vis('generated_at')" class="w-24 text-right">
              <button class="inline-flex items-center gap-1 hover:text-foreground" @click="table.getColumn('generated_at')?.toggleSorting()">Créée <component :is="sortIcon('generated_at')" class="size-3.5 opacity-60" /></button>
            </TableHead>
            <TableHead class="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="row in table.getRowModel().rows" :key="row.id" :data-state="row.getIsSelected() ? 'selected' : undefined" class="cursor-pointer" @click="selectedId = row.original.id">
            <TableCell @click.stop>
              <Checkbox :model-value="row.getIsSelected()" aria-label="Sélectionner la ligne" @update:model-value="(v: boolean) => row.toggleSelected(!!v)" />
            </TableCell>
            <TableCell>
              <div class="flex items-center gap-2 font-medium">
                {{ row.original.title }}
                <NuxtLink
                  v-if="row.original.hill_id"
                  :to="`/hills/${row.original.hill_id}`"
                  class="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground hover:text-foreground hover:underline"
                  @click.stop
                >
                  {{ row.original.hill_name || 'Cycle' }}
                  <ExternalLink class="size-3" />
                </NuxtLink>
              </div>
            </TableCell>
            <TableCell v-if="vis('status')"><StatusBadge :status="row.original.status" /></TableCell>
            <TableCell v-if="vis('candidate_count')" class="text-right tabular-nums">{{ row.original.candidate_count }}</TableCell>
            <TableCell v-if="vis('vote_count')" class="text-right tabular-nums">{{ row.original.vote_count }}</TableCell>
            <TableCell v-if="vis('owner')">
              <div class="flex items-center gap-1.5 text-sm"><UserAvatar :name="row.original.owner_name" />{{ row.original.owner_name }}</div>
            </TableCell>
            <TableCell v-if="vis('generated_at')" class="text-right text-muted-foreground tabular-nums">{{ relTime(row.original.generated_at) }}</TableCell>
            <TableCell @click.stop>
              <DropdownMenu>
                <DropdownMenuTrigger as-child>
                  <Button variant="ghost" size="icon" class="size-8 text-muted-foreground"><MoreHorizontal class="size-4" /><span class="sr-only">Actions</span></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem v-if="row.original.status === 'deleted'" :disabled="restoring" @click="restore(row.original.id)"><RotateCcw /> Réactiver</DropdownMenuItem>
                  <DropdownMenuItem v-else variant="destructive" @click="askDelete({ id: row.original.id, title: row.original.title })"><Trash2 /> Supprimer</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
          <TableRow v-if="!table.getRowModel().rows.length">
            <TableCell :colspan="8" class="h-24 text-center text-muted-foreground">Aucune table.</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>

    <!-- Footer / pagination -->
    <div class="flex items-center justify-between gap-4 text-sm">
      <div class="text-muted-foreground">{{ table.getFilteredSelectedRowModel().rows.length }} / {{ table.getFilteredRowModel().rows.length }} table(s) sélectionnée(s)</div>
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

    <p v-if="role !== 'owner'" class="text-xs text-muted-foreground">Vous pouvez voter ; seul l'owner valide une table.</p>

    <!-- Quick-view Sheet -->
    <Sheet v-model:open="sheetOpen">
      <SheetContent class="flex w-full flex-col gap-0 p-0 sm:max-w-[min(92vw,1100px)]" @interact-outside="keepSheetOpenOnMenu" @focus-outside="keepSheetOpenOnMenu">
        <template v-if="detail">
          <SheetTitle class="sr-only">{{ detail.table.title }}</SheetTitle>
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <button
                title="Actions"
                class="ring-offset-background focus:ring-ring absolute top-4 right-[4.75rem] rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden"
              >
                <MoreHorizontal class="size-4" />
                <span class="sr-only">Actions</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem variant="destructive" @click="askDelete({ id: detail.table.id, title: detail.table.title }); selectedId = null"><Trash2 /> Supprimer</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <NuxtLink
            :to="`/betting/${detail.table.id}`"
            title="Ouvrir la page de la table"
            class="ring-offset-background focus:ring-ring absolute top-4 right-12 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden"
          >
            <ExternalLink class="size-4" />
            <span class="sr-only">Ouvrir la page</span>
          </NuxtLink>
          <BettingTableDetail :data="detail" compact @select-feature="featPeek = $event">
            <template #candidate-action="{ candidate }">
              <Button v-if="detail.table.status === 'open'" :variant="iVoted(candidate) ? 'default' : 'outline'" size="sm" :disabled="voting" @click="vote(candidate.id)">
                <Check class="size-3.5" /> {{ iVoted(candidate) ? 'Voté' : 'Voter' }}
              </Button>
            </template>
            <template v-if="detail.table.status === 'open' && role === 'owner'" #candidates-footer>
              <Button @click="validateOpen = true">Valider la table</Button>
            </template>
          </BettingTableDetail>
          <ValidateTableDialog v-model:open="validateOpen" :table-id="detail.table.id" :candidates="detail.candidates" @validated="onValidated" />
        </template>
      </SheetContent>
    </Sheet>

    <!-- Feature peek — from the Sheet, open the feature as a modal Dialog -->
    <FeatureDetailOverlay v-model:feature-id="featPeek" mode="dialog" />

    <!-- Delete confirmation -->
    <AlertDialog v-model:open="confirmOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer cette betting table ?</AlertDialogTitle>
          <AlertDialogDescription>
            « {{ toDelete?.title }} » passera au statut « Supprimée ». Ses candidats, votes et historique sont conservés et tu pourras la réactiver depuis l'onglet « Supprimées ».
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
