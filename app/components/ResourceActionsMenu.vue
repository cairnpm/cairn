<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { MoreHorizontal, RotateCcw, Trash2 } from 'lucide-vue-next'

// The "⋯" actions menu for a soft-deletable resource: when deleted, Restore + a destructive permanent
// Delete (only shown when a purgeLabel is provided); otherwise a destructive soft Delete.
defineProps<{ isDeleted: boolean; restoring?: boolean; actionsLabel: string; restoreLabel: string; deleteLabel: string; purgeLabel?: string }>()
const emit = defineEmits<{ restore: []; delete: []; purge: [] }>()
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" size="icon" class="size-8 text-muted-foreground"><MoreHorizontal class="size-4" /><span class="sr-only">{{ actionsLabel }}</span></Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <template v-if="isDeleted">
        <DropdownMenuItem :disabled="restoring" @click="emit('restore')"><RotateCcw /> {{ restoreLabel }}</DropdownMenuItem>
        <DropdownMenuItem v-if="purgeLabel" variant="destructive" @click="emit('purge')"><Trash2 /> {{ purgeLabel }}</DropdownMenuItem>
      </template>
      <DropdownMenuItem v-else variant="destructive" @click="emit('delete')"><Trash2 /> {{ deleteLabel }}</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
