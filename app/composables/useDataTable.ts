import { ref, type Ref } from 'vue'
import {
  type ColumnDef, type ColumnFiltersState, type SortingState, type VisibilityState,
  getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, useVueTable,
} from '@tanstack/vue-table'

// Shared @tanstack/vue-table wiring for the list screens (Backlog / Betting / Hills): state refs,
// the table config, the status-filter watch, and the vis()/hideableCols helpers. Columns, row cells
// and the column.filterFn stay per-screen — only the boilerplate is here.
export function useDataTable<T>(opts: {
  data: Ref<T[]>
  columns: ColumnDef<T>[]
  getRowId?: (row: T) => string
  initialSort?: SortingState
  pageSize?: number
  // Wire a status-filter ref to the 'status' column. `mapValue` lets a screen send a different value
  // to the column than the tab key (Hills sends undefined for 'all'; Backlog/Betting handle it in filterFn).
  statusFilter?: Ref<string>
  mapStatusValue?: (v: string) => unknown
}) {
  const sorting = ref<SortingState>(opts.initialSort ?? [])
  const columnFilters = ref<ColumnFiltersState>([])
  const columnVisibility = ref<VisibilityState>({})
  const rowSelection = ref({})

  function set<V>(updater: V | ((old: V) => V), r: { value: V }) {
    r.value = typeof updater === 'function' ? (updater as (o: V) => V)(r.value) : updater
  }

  const table = useVueTable({
    get data() { return opts.data.value },
    columns: opts.columns,
    state: {
      get sorting() { return sorting.value },
      get columnFilters() { return columnFilters.value },
      get columnVisibility() { return columnVisibility.value },
      get rowSelection() { return rowSelection.value },
    },
    getRowId: opts.getRowId ?? ((row: T) => (row as { id: string }).id),
    enableRowSelection: true,
    onSortingChange: u => set(u, sorting),
    onColumnFiltersChange: u => set(u, columnFilters),
    onColumnVisibilityChange: u => set(u, columnVisibility),
    onRowSelectionChange: u => set(u, rowSelection),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: opts.pageSize ?? 10 } },
  })

  if (opts.statusFilter) {
    const map = opts.mapStatusValue ?? ((v: string) => v)
    watch(opts.statusFilter, v => table.getColumn('status')?.setFilterValue(map(v)), { immediate: true })
  }

  const hideableCols = computed(() => table.getAllColumns().filter(c => c.getCanHide()))
  const vis = (id: string) => table.getColumn(id)?.getIsVisible() ?? true

  return { table, sorting, columnFilters, columnVisibility, rowSelection, hideableCols, vis }
}
