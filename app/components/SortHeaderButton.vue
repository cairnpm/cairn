<script setup lang="ts">
import { computed } from 'vue'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-vue-next'
import type { Table } from '@tanstack/vue-table'

// Sortable column header: label + a sort-direction arrow. Toggles the column's sort on click.
const props = defineProps<{ table: Table<any>; column: string; label: string }>()
const icon = computed(() => {
  const s = props.table.getColumn(props.column)?.getIsSorted()
  return s === 'asc' ? ArrowUp : s === 'desc' ? ArrowDown : ChevronsUpDown
})
</script>

<template>
  <button class="inline-flex items-center gap-1 hover:text-foreground" @click="table.getColumn(column)?.toggleSorting()">
    {{ label }} <component :is="icon" class="size-3.5 opacity-60" />
  </button>
</template>
