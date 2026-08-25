<script setup lang="ts">
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'

// Confirmation dialog for an action that can't be taken back — a deletion, or shipping a feature
// (which this product never reopens). Labels arrive already-translated; emits `confirm` on the action.
const open = defineModel<boolean>('open', { default: false })
defineProps<{ title: string; description: string; cancelLabel: string; confirmLabel: string; busy?: boolean; destructive?: boolean }>()
const emit = defineEmits<{ confirm: [] }>()
</script>

<template>
  <AlertDialog v-model:open="open">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ title }}</AlertDialogTitle>
        <AlertDialogDescription>{{ description }}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel :disabled="busy">{{ cancelLabel }}</AlertDialogCancel>
        <AlertDialogAction
          :class="cn(destructive && 'bg-destructive text-white hover:bg-destructive/90')"
          :disabled="busy" @click="emit('confirm')"
        >{{ confirmLabel }}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
