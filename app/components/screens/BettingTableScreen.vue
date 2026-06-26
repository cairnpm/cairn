<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowRight, Check } from 'lucide-vue-next'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface Candidate {
  id: string; feature_id: string; score: number
  title_snap: string; problem_snap: string | null; appetite_snap: string | null
  signal_count_snap: number; selected: number; voters: string[]
}
interface Evt { seq: number; actor: string; action: string; summary: string; created_at: string }
interface TableDetail {
  table: { id: string; title: string; status: string; owner_name: string | null; hill_id: string | null; validated_by: string | null }
  candidates: Candidate[]
  events: Evt[]
}

const bike = useBicycle()
const { author, role, selectedBettingTable } = bike
const id = selectedBettingTable
const { data, refresh } = await useFetch<TableDetail>(() => `/api/betting-tables/${id.value}`, { getCachedData: getFreshData })

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
const iVoted = (c: Candidate) => c.voters.includes(author.value)
function impact(score: number) { return score >= 2.5 ? 'Très haute' : score >= 1.5 ? 'Haute' : score >= 0.8 ? 'Moyenne' : 'Basse' }
function relTime(iso: string) {
  const d = Date.parse(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z')
  if (Number.isNaN(d)) return ''
  const s = Math.floor((Date.now() - d) / 1000)
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}min`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}j`
}
</script>

<template>
  <div v-if="data" class="flex h-full flex-col gap-4 overflow-auto p-4">
    <!-- Header -->
    <Card class="py-0">
      <CardContent class="flex flex-col gap-3 p-4">
        <div class="flex items-start justify-between gap-4">
          <div class="flex items-center gap-2">
            <h1 class="text-lg font-semibold tracking-tight">{{ data.table.title }}</h1>
            <StatusBadge :status="data.table.status" />
          </div>
          <div class="flex items-center gap-2">
            <Button v-if="data.table.hill_id" as-child variant="link" size="sm" class="h-7 px-0">
              <NuxtLink :to="`/hills/${data.table.hill_id}`">Voir le cycle <ArrowRight class="size-3.5" /></NuxtLink>
            </Button>
            <Button v-if="isOpen && role === 'owner'" size="sm" @click="openValidate">Valider la table</Button>
          </div>
        </div>
        <Separator />
        <div class="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm">
          <div><div class="text-xs text-muted-foreground">Créée par</div><div class="flex items-center gap-1.5 font-medium"><UserAvatar :name="data.table.owner_name" class="size-5" />{{ data.table.owner_name }}</div></div>
          <div><div class="text-xs text-muted-foreground">Candidats</div><div class="font-medium tabular-nums">{{ data.candidates.length }}</div></div>
          <div><div class="text-xs text-muted-foreground">Votes</div><div class="font-medium tabular-nums">{{ data.candidates.reduce((s, c) => s + c.voters.length, 0) }}</div></div>
          <div v-if="data.table.validated_by"><div class="text-xs text-muted-foreground">Validée par</div><div class="font-medium">{{ data.table.validated_by }}</div></div>
        </div>
      </CardContent>
    </Card>

    <!-- Candidates -->
    <div class="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{{ isOpen ? 'Candidat' : 'Feature' }}</TableHead>
            <TableHead class="w-28">Votes</TableHead>
            <TableHead class="w-24">Impact</TableHead>
            <TableHead class="w-24 text-right">{{ isOpen ? 'Vote' : '' }}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="c in data.candidates" :key="c.id">
            <TableCell>
              <div class="flex items-center gap-2 font-medium">
                {{ c.title_snap }}
                <Badge v-if="c.selected" class="gap-1"><Check class="size-3" /> parié</Badge>
              </div>
              <div class="text-xs text-muted-foreground truncate max-w-md">{{ c.problem_snap }}</div>
            </TableCell>
            <TableCell>
              <div v-if="c.voters.length" class="flex items-center gap-1">
                <UserAvatar v-for="v in c.voters" :key="v" :name="v" class="size-5 -mr-1.5 ring-2 ring-background" />
              </div>
              <span v-else class="text-xs text-muted-foreground">—</span>
            </TableCell>
            <TableCell><Badge variant="outline">{{ impact(c.score) }}</Badge></TableCell>
            <TableCell class="text-right">
              <Button v-if="isOpen" :variant="iVoted(c) ? 'default' : 'outline'" size="sm" :disabled="busy" @click="toggleVote(c.id)">
                <Check class="size-3.5" /> {{ iVoted(c) ? 'Voté' : 'Voter' }}
              </Button>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>

    <!-- Timeline -->
    <Card class="py-0">
      <CardContent class="p-4">
        <div class="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Timeline · {{ data.events.length }} événements</div>
        <div class="flex flex-col gap-3">
          <div v-for="e in data.events" :key="e.seq" class="flex items-center gap-2.5 text-sm">
            <UserAvatar :name="e.actor" class="size-6 shrink-0" />
            <div class="flex-1"><div>{{ e.summary }}</div><div class="text-xs text-muted-foreground">{{ relTime(e.created_at) }}</div></div>
          </div>
        </div>
      </CardContent>
    </Card>

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
  </div>
</template>
