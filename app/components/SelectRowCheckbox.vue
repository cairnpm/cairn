<script setup lang="ts">
import { Checkbox } from '@/components/ui/checkbox'
import type { Row } from '@tanstack/vue-table'

// Per-row selection checkbox.
defineProps<{ row: Row<any>; label: string }>()
</script>

<template>
  <Checkbox :model-value="row.getIsSelected()" :aria-label="label" @update:model-value="(v: boolean | 'indeterminate') => row.toggleSelected(!!v)" />
</template>
