<script setup lang="ts">
import { computed, onUnmounted, ref, watchEffect } from 'vue'
import { MoreHorizontal, RotateCcw, Trash2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { FeatureDetailData } from '~/types/feature'

const route = useRoute()
const bike = useCairn()
const { data: detail, error } = await useApiData<FeatureDetailData>(qk.featureDetail, () => `/api/features/${route.params.id}`)
const { mutate } = useApiMutation()

// Feed the breadcrumb (Workspace › Backlog › <feature title>).
watchEffect(() => { if (detail.value) bike.setCrumb(detail.value.feature.title) })
onUnmounted(() => bike.setCrumb(''))

const isDeleted = computed(() => detail.value?.feature.status === 'deleted')
const confirmOpen = ref(false)
const deleting = ref(false)
async function confirmDelete() {
  if (deleting.value) return
  deleting.value = true
  try {
    await mutate(`/api/features/${route.params.id}`, { method: 'DELETE', invalidates: [qk.features, qk.overview] })
    if (bike.selectedFeatureId.value === route.params.id) bike.clearFeature()
    await navigateTo('/backlog')
  } finally { deleting.value = false }
}
const restoring = ref(false)
async function restore() {
  if (restoring.value) return
  restoring.value = true
  try { await mutate(`/api/features/${route.params.id}/restore`, { invalidates: [qk.featureDetail, qk.features, qk.overview] }) } finally { restoring.value = false }
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
            <DropdownMenuItem v-if="isDeleted" :disabled="restoring" @click="restore"><RotateCcw /> Réactiver</DropdownMenuItem>
            <DropdownMenuItem v-else variant="destructive" @click="confirmOpen = true"><Trash2 /> Supprimer</DropdownMenuItem>
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
            « {{ detail?.feature.title }} » passera au statut « Supprimée ». Son historique est conservé et tu pourras la réactiver depuis l'onglet « Supprimées » du backlog.
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
