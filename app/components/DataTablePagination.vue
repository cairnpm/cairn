<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from 'lucide-vue-next'
import type { Table } from '@tanstack/vue-table'

// Pagination footer shared by every list screen. Labels arrive already-translated (the screens own
// their i18n keys + interpolation), so this component is i18n-agnostic.
defineProps<{
  table: Table<any>
  selectedLabel: string
  rowsPerPageLabel: string
  pageLabel: string
  pageSizes?: number[]
}>()
</script>

<template>
  <div class="flex items-center justify-between gap-4 text-sm">
    <div class="text-muted-foreground">{{ selectedLabel }}</div>
    <div class="flex items-center gap-6">
      <div class="flex items-center gap-2">
        <span class="text-muted-foreground hidden sm:inline">{{ rowsPerPageLabel }}</span>
        <Select :model-value="String(table.getState().pagination.pageSize)" @update:model-value="(v: any) => table.setPageSize(Number(v))">
          <SelectTrigger size="sm" class="w-16"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem v-for="n in (pageSizes ?? [10, 20, 30, 50])" :key="n" :value="String(n)">{{ n }}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div class="text-muted-foreground tabular-nums">{{ pageLabel }}</div>
      <div class="flex items-center gap-1">
        <Button variant="outline" size="icon" class="size-8" :disabled="!table.getCanPreviousPage()" @click="table.setPageIndex(0)"><ChevronFirst class="size-4" /></Button>
        <Button variant="outline" size="icon" class="size-8" :disabled="!table.getCanPreviousPage()" @click="table.previousPage()"><ChevronLeft class="size-4" /></Button>
        <Button variant="outline" size="icon" class="size-8" :disabled="!table.getCanNextPage()" @click="table.nextPage()"><ChevronRight class="size-4" /></Button>
        <Button variant="outline" size="icon" class="size-8" :disabled="!table.getCanNextPage()" @click="table.setPageIndex(table.getPageCount() - 1)"><ChevronLast class="size-4" /></Button>
      </div>
    </div>
  </div>
</template>
