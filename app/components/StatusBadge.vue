<script setup lang="ts">
import { computed } from 'vue'
import { Badge } from '@/components/ui/badge'

// Monochrome status pills (black & white): solid for shipped, secondary for active, outline otherwise.
const props = defineProps<{ status: string }>()
const VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  done: 'default',
  bet: 'secondary',
  building: 'secondary',
  validated: 'default',
  open: 'secondary',
  shaped: 'outline',
  planned: 'outline',
  active: 'secondary',
  closed: 'outline',
  archived: 'outline',
  cancelled: 'outline',
}
const variant = computed(() => VARIANT[props.status] ?? 'outline')
</script>

<template>
  <Badge :variant="variant" class="capitalize font-medium">{{ status }}</Badge>
</template>
