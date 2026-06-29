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
  deleted: 'destructive',
}
const variant = computed(() => VARIANT[props.status] ?? 'outline')

const { t } = useUiLang()
const label = computed(() => {
  const key = `common.status.${props.status}`
  const translated = t(key)
  return translated === key ? props.status : translated
})
</script>

<template>
  <Badge :variant="variant" class="capitalize font-medium">{{ label }}</Badge>
</template>
