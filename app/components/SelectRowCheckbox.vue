<script setup lang="ts">
import { Checkbox } from '@/components/ui/checkbox'
import type { Row } from '@tanstack/vue-table'

// Per-row selection checkbox.
defineProps<{ row: Row<any>; ariaLabel: string }>()
</script>

<template>
  <Checkbox :model-value="row.getIsSelected()" :aria-label="ariaLabel" @update:model-value="(v: boolean) => row.toggleSelected(!!v)" />
</template>
