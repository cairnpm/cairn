<script setup lang="ts">
import { Checkbox } from '@/components/ui/checkbox'
import type { Table } from '@tanstack/vue-table'

// Header "select all rows on this page" checkbox, with the indeterminate (partial selection) state.
defineProps<{ table: Table<any>; label: string }>()
</script>

<template>
  <Checkbox
    :model-value="table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')"
    :aria-label="label"
    @update:model-value="(v: boolean | 'indeterminate') => table.toggleAllPageRowsSelected(!!v)"
  />
</template>
