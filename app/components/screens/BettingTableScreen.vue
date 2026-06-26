<script setup lang="ts">
import { computed, onUnmounted, ref, watchEffect } from 'vue'
import { Check, MoreHorizontal, RotateCcw, Trash2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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
const hillName = ref('')
const startsAt = ref('')
const endsAt = ref('')
const why = ref('')
const picked = ref<string[]>([])
const validating = ref(false)
const votedCandidates = computed(() => (data.value?.candidates || []).filter(c => c.voters.length > 0))
function openValidate() { picked.value = votedCandidates.value.map(c => c.id); showValidate.value = true }
function togglePick(cid: string) { picked.value = picked.value.includes(cid) ? picked.value.filter(x => x !== cid) : [...picked.value, cid] }
async function validate() {
  if (validating.value || !hillName.value.trim()) return
  validating.value = true
  try {
    await $fetch(`/api/betting-tables/${id.value}/validate`, {
      method: 'POST',
      body: { hill_name: hillName.value, starts_at: startsAt.value || null, ends_at: endsAt.value || null, rationale: why.value, selected_ids: picked.value },
    })
    await refresh()
    showValidate.value = false
  } finally { validating.value = false }
}

const isOpen = computed(() => data.value?.table.status === 'open')
const iVoted = (c: BettingCandidate) => c.voters.includes(author.value)
</script>

<template>
  <div v-if="data" class="h-full">
    <BettingTableDetail :data="data">
      <template #header-action>
        <Button v-if="isOpen && role === 'owner'" size="sm" @click="openValidate">Valider la table</Button>
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
    </BettingTableDetail>

    <!-- Validate dialog -->
    <Dialog v-model:open="showValidate">
      <DialogContent class="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Valider → créer le cycle</DialogTitle>
          <DialogDescription>Les features cochées passent en « bet » et rejoignent un nouveau Hill.</DialogDescription>
        </DialogHeader>
        <div class="flex flex-col gap-4">
          <div class="grid gap-2">
            <Label for="hillName">Nom du cycle</Label>
            <Input id="hillName" v-model="hillName" placeholder="Sécurité & Data" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div class="grid gap-2"><Label for="s">Début</Label><Input id="s" v-model="startsAt" type="date" /></div>
            <div class="grid gap-2"><Label for="e">Fin</Label><Input id="e" v-model="endsAt" type="date" /></div>
          </div>
          <div class="grid gap-2">
            <Label for="why">Rationale</Label>
            <Textarea id="why" v-model="why" placeholder="Le « pourquoi » de ce cycle…" />
          </div>
          <div>
            <div class="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Features à parier</div>
            <div class="flex flex-col gap-1.5">
              <label v-for="c in votedCandidates" :key="c.id" class="flex items-center gap-2 text-sm">
                <input type="checkbox" :checked="picked.includes(c.id)" class="size-4 accent-primary" @change="togglePick(c.id)">
                {{ c.title_snap }} <span class="text-muted-foreground">({{ c.voters.length }} vote{{ c.voters.length > 1 ? 's' : '' }})</span>
              </label>
              <p v-if="!votedCandidates.length" class="text-sm text-muted-foreground">Aucun candidat voté — votez d'abord, ou cochez manuellement.</p>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="showValidate = false">Annuler</Button>
          <Button :disabled="validating || !hillName.trim()" @click="validate">{{ validating ? 'Validation…' : 'Confirmer & créer' }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

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
