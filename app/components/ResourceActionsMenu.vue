<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { MoreHorizontal, RotateCcw, Trash2 } from 'lucide-vue-next'

// The "⋯" actions menu for a soft-deletable resource: Restore when deleted, else a destructive Delete.
defineProps<{ isDeleted: boolean; restoring?: boolean; actionsLabel: string; restoreLabel: string; deleteLabel: string }>()
const emit = defineEmits<{ restore: []; delete: [] }>()
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" size="icon" class="size-8 text-muted-foreground"><MoreHorizontal class="size-4" /><span class="sr-only">{{ actionsLabel }}</span></Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem v-if="isDeleted" :disabled="restoring" @click="emit('restore')"><RotateCcw /> {{ restoreLabel }}</DropdownMenuItem>
      <DropdownMenuItem v-else variant="destructive" @click="emit('delete')"><Trash2 /> {{ deleteLabel }}</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
