<script setup lang="ts">
import { computed, onUnmounted, ref, watchEffect } from 'vue'
import { Check, MoreHorizontal, RotateCcw, Trash2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { BettingCandidate, BettingTableDetailData } from '~/types/betting'

const bike = useBicycle()
const { author, role, selectedBettingTable } = bike
const id = selectedBettingTable
const { data, refresh } = await useFetch<BettingTableDetailData>(() => `/api/betting-tables/${id.value}`, { getCachedData: getFreshData })

// Feed the breadcrumb (Workspace › Betting Table › <table title>).
watchEffect(() => { if (data.value) bike.setCrumb(data.value.table.title) })
onUnmounted(() => bike.setCrumb(''))

const isDeleted = computed(() => data.value?.table.status === 'deleted')
const confirmOpen = ref(false)
const deleting = ref(false)
async function confirmDelete() {
  if (deleting.value) return
  deleting.value = true
  try {
    await $fetch(`/api/betting-tables/${id.value}`, { method: 'DELETE' })
    await navigateTo('/betting')
  } finally { deleting.value = false }
}
const restoring = ref(false)
async function restore() {
  if (restoring.value) return
  restoring.value = true
  try { await $fetch(`/api/betting-tables/${id.value}/restore`, { method: 'POST' }); await refresh() } finally { restoring.value = false }
}

const busy = ref(false)
async function toggleVote(candidateId: string) {
  if (busy.value || data.value?.table.status !== 'open') return
  busy.value = true
  try {
    await $fetch(`/api/betting-tables/${id.value}/votes`, { method: 'POST', body: { candidate_id: candidateId } })
    await refresh()
  } finally { busy.value = false }
}

const showValidate = ref(false)
const featPeek = ref<string | null>(null)
const isOpen = computed(() => data.value?.table.status === 'open')
const iVoted = (c: BettingCandidate) => c.voters.includes(author.value)
</script>

<template>
  <div v-if="data" class="h-full">
    <BettingTableDetail :data="data" @select-feature="featPeek = $event">
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
      <template #candidate-action="{ candidate }">
        <Button v-if="isOpen" :variant="iVoted(candidate) ? 'default' : 'outline'" size="sm" :disabled="busy" @click="toggleVote(candidate.id)">
          <Check class="size-3.5" /> {{ iVoted(candidate) ? 'Voté' : 'Voter' }}
        </Button>
      </template>
      <template v-if="isOpen && role === 'owner'" #candidates-footer>
        <Button @click="showValidate = true">Valider la table</Button>
      </template>
    </BettingTableDetail>

    <!-- Feature peek — from the dedicated page, open the feature as a side Sheet -->
    <FeatureDetailOverlay v-model:feature-id="featPeek" mode="sheet" />

    <!-- Validate dialog -->
    <ValidateTableDialog v-model:open="showValidate" :table-id="id" :candidates="data.candidates" @validated="refresh" />

    <!-- Delete confirmation -->
    <AlertDialog v-model:open="confirmOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer cette betting table ?</AlertDialogTitle>
          <AlertDialogDescription>
            « {{ data.table.title }} » passera au statut « Supprimée ». Ses candidats, votes et historique sont conservés et tu pourras la réactiver depuis l'onglet « Supprimées ».
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
