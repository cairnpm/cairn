<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'vue-sonner'
import type { BettingCandidate } from '~/types/betting'

const { t } = useUiLang()
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
    toast.success(t('betting.toast.validated'))
    emit('validated')
    open.value = false
  } catch (e: unknown) { toast.error((e as { statusMessage?: string })?.statusMessage || t('betting.toast.validateError')) } finally { validating.value = false }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{{ t('betting.validateDialog.title') }}</DialogTitle>
        <DialogDescription>{{ t('betting.validateDialog.description') }}</DialogDescription>
      </DialogHeader>
      <div class="flex flex-col gap-4">
        <div class="grid gap-2">
          <Label for="hillName">{{ t('betting.validateDialog.cycleName') }}</Label>
          <Input id="hillName" v-model="hillName" :placeholder="t('betting.validateDialog.cycleNamePlaceholder')" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="grid gap-2"><Label for="s">{{ t('betting.validateDialog.start') }}</Label><Input id="s" v-model="startsAt" type="date" /></div>
          <div class="grid gap-2"><Label for="e">{{ t('betting.validateDialog.end') }}</Label><Input id="e" v-model="endsAt" type="date" /></div>
        </div>
        <div class="grid gap-2">
          <Label for="why">{{ t('betting.validateDialog.rationale') }}</Label>
          <Textarea id="why" v-model="why" :placeholder="t('betting.validateDialog.rationalePlaceholder')" />
        </div>
        <div>
          <div class="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{{ t('betting.validateDialog.featuresToBet') }}</div>
          <div class="flex flex-col gap-1.5">
            <label v-for="c in voted" :key="c.id" class="flex items-center gap-2 text-sm">
              <input type="checkbox" :checked="picked.includes(c.id)" class="size-4 accent-primary" @change="togglePick(c.id)">
              {{ c.title_snap }} <span class="text-muted-foreground">({{ c.voters.length }} {{ c.voters.length > 1 ? t('betting.votesNoun') : t('betting.voteNoun') }})</span>
            </label>
            <p v-if="!voted.length" class="text-sm text-muted-foreground">{{ t('betting.validateDialog.noVoted') }}</p>
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" @click="open = false">{{ t('betting.cancel') }}</Button>
        <Button :disabled="validating || !hillName.trim()" @click="validate">{{ validating ? t('betting.validating') : t('betting.confirmCreate') }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
