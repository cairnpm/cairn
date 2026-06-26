<script setup lang="ts">
import { onUnmounted, ref, watchEffect } from 'vue'
import { MoreHorizontal, Trash2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { FeatureDetailData } from '~/types/feature'

const route = useRoute()
const bike = useBicycle()
const { data: detail, error } = await useFetch<FeatureDetailData>(() => `/api/features/${route.params.id}`, { getCachedData: getFreshData })

// Feed the breadcrumb (Workspace › Backlog › <feature title>).
watchEffect(() => { if (detail.value) bike.setCrumb(detail.value.feature.title) })
onUnmounted(() => bike.setCrumb(''))

const confirmOpen = ref(false)
const deleting = ref(false)
async function confirmDelete() {
  if (deleting.value) return
  deleting.value = true
  try {
    await $fetch(`/api/features/${route.params.id}`, { method: 'DELETE' })
    if (bike.selectedFeatureId.value === route.params.id) bike.clearFeature()
    await navigateTo('/backlog')
  } finally { deleting.value = false }
}
</script>

<template>
  <div class="h-full">
    <FeatureDetail v-if="detail" :detail="detail">
      <template #header-action>
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button variant="ghost" size="icon" class="size-8 text-muted-foreground"><MoreHorizontal class="size-4" /><span class="sr-only">Actions</span></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem variant="destructive" @click="confirmOpen = true"><Trash2 /> Supprimer</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </template>
    </FeatureDetail>
    <div v-else class="flex h-full items-center justify-center text-sm text-muted-foreground">
      {{ error ? 'Feature introuvable.' : 'Chargement…' }}
    </div>

    <AlertDialog v-model:open="confirmOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer cette feature ?</AlertDialogTitle>
          <AlertDialogDescription>
            « {{ detail?.feature.title }} » et tout son historique (signaux, décisions, activité) seront définitivement supprimés. Cette action est irréversible.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel :disabled="deleting">Annuler</AlertDialogCancel>
          <AlertDialogAction class="bg-destructive text-white hover:bg-destructive/90" :disabled="deleting" @click="confirmDelete">{{ deleting ? 'Suppression…' : 'Supprimer' }}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
