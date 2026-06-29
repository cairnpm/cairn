<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'vue-sonner'
import type { BettingCandidate } from '~/types/betting'

const props = defineProps<{ tableId: string; candidates: BettingCandidate[] }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ validated: [] }>()

const hillName = ref('')
const startsAt = ref('')
const endsAt = ref('')
const why = ref('')
const picked = ref<string[]>([])
const validating = ref(false)
const voted = computed(() => props.candidates.filter(c => c.voters.length > 0))

// Pre-select the voted candidates each time the dialog opens.
watch(open, (v) => {
  if (!v) return
  picked.value = voted.value.map(c => c.id)
  hillName.value = ''
  startsAt.value = ''
  endsAt.value = ''
  why.value = ''
})
function togglePick(cid: string) {
  picked.value = picked.value.includes(cid) ? picked.value.filter(x => x !== cid) : [...picked.value, cid]
}
async function validate() {
  if (validating.value || !hillName.value.trim()) return
  validating.value = true
  try {
    await $fetch(`/api/betting-tables/${props.tableId}/validate`, {
      method: 'POST',
      body: { hill_name: hillName.value, starts_at: startsAt.value || null, ends_at: endsAt.value || null, rationale: why.value, selected_ids: picked.value },
    })
    toast.success('Table validée — cycle ouvert')
    emit('validated')
    open.value = false
  } catch (e: unknown) { toast.error((e as { statusMessage?: string })?.statusMessage || 'Validation impossible') } finally { validating.value = false }
}
</script>

<template>
  <Dialog v-model:open="open">
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
            <label v-for="c in voted" :key="c.id" class="flex items-center gap-2 text-sm">
              <input type="checkbox" :checked="picked.includes(c.id)" class="size-4 accent-primary" @change="togglePick(c.id)">
              {{ c.title_snap }} <span class="text-muted-foreground">({{ c.voters.length }} vote{{ c.voters.length > 1 ? 's' : '' }})</span>
            </label>
            <p v-if="!voted.length" class="text-sm text-muted-foreground">Aucun candidat voté — votez d'abord, ou cochez manuellement.</p>
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" @click="open = false">Annuler</Button>
        <Button :disabled="validating || !hillName.trim()" @click="validate">{{ validating ? 'Validation…' : 'Confirmer & créer' }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
