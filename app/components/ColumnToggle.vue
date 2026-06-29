<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ChevronsUpDown, Columns3 } from 'lucide-vue-next'
import type { Column } from '@tanstack/vue-table'

// Column-visibility dropdown. `columns` = the hideable columns, `labels` = id→translated name.
defineProps<{ columns: Column<any>[]; labels: Record<string, string>; buttonText: string }>()
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="outline" size="sm"><Columns3 class="size-4" /> {{ buttonText }} <ChevronsUpDown class="size-4 opacity-50" /></Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-40">
      <DropdownMenuCheckboxItem
        v-for="col in columns" :key="col.id"
        class="capitalize" :model-value="col.getIsVisible()"
        @update:model-value="(v: boolean) => col.toggleVisibility(!!v)"
      >{{ labels[col.id] || col.id }}</DropdownMenuCheckboxItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
