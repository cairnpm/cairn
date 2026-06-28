<script setup lang="ts">
import { computed, reactive } from 'vue'
import { ChevronRight, Pencil, Plus } from 'lucide-vue-next'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

interface Candidate { feature_id: string; title: string; similarity: number }
interface Proposal { action: 'create_feature' | 'append' | 'merge' | 'discard'; target_feature_id: string | null; rationale: string; proposed_spec: { title: string; problem: string; appetite: string }; candidates: Candidate[] }
interface Segment { id: string; signal: { title: string; problem: string; classification: string }; proposal: Proposal; include: boolean; duplicate_of?: string | null }
type Action = 'create_feature' | 'append'

const props = defineProps<{ segments: Segment[]; pending?: boolean }>()
const emit = defineEmits<{ confirm: [sel: { id: string; action_override: Action; target_override: string | null }[]]; cancel: [] }>()

// Local editable copy: include flag + action/target overrides per segment.
const rows = reactive(props.segments.map(s => ({
  id: s.id,
  include: s.include && s.proposal.action !== 'discard',
  action: (s.proposal.action === 'append' ? 'append' : 'create_feature') as Action,
  target: s.proposal.target_feature_id,
  signal: s.signal,
  proposal: s.proposal,
  wasDiscard: s.proposal.action === 'discard',
  duplicate_of: s.duplicate_of ?? null,
  showWhy: false,
})))

const ACTION_LABEL: Record<Action, string> = { create_feature: 'Nouvelle feature', append: 'Rattacher' }
const includedCount = computed(() => rows.filter(r => r.include).length)
const createdCount = computed(() => rows.filter(r => r.include && r.action === 'create_feature').length)
const updatedCount = computed(() => rows.filter(r => r.include && r.action === 'append').length)

function candTitle(id: string | null): string {
  if (!id) return ''
  for (const r of rows) { const c = r.proposal.candidates.find(x => x.feature_id === id); if (c) return c.title }
  return id.slice(0, 8)
}
function confirm() {
  emit('confirm', rows.filter(r => r.include).map(r => ({ id: r.id, action_override: r.action, target_override: r.action === 'append' ? r.target : null })))
}
</script>

<template>
  <div class="flex h-full flex-col">
    <header class="flex items-center justify-between gap-3 border-b px-6 py-4">
      <div class="min-w-0">
        <h2 class="text-base font-semibold tracking-tight">{{ segments.length }} sujets détectés</h2>
        <p class="text-sm text-muted-foreground">{{ createdCount }} nouvelle(s) · {{ updatedCount }} mise(s) à jour · {{ segments.length - includedCount }} ignoré(s)</p>
      </div>
      <div class="flex shrink-0 gap-2">
        <Button variant="ghost" :disabled="pending" @click="emit('cancel')">Retour au chat</Button>
        <Button :disabled="pending || !includedCount" @click="confirm">{{ pending ? 'Écriture…' : `Confirmer (${includedCount})` }}</Button>
      </div>
    </header>

    <ScrollArea class="min-h-0 flex-1">
      <div class="mx-auto flex max-w-3xl flex-col gap-3 p-6">
        <Card v-for="r in rows" :key="r.id" class="py-0 transition-opacity" :class="r.include ? '' : 'opacity-55'">
          <CardContent class="flex items-start gap-3 p-4">
            <Checkbox :model-value="r.include" class="mt-1 shrink-0" @update:model-value="(v: boolean) => r.include = !!v" />
            <div class="min-w-0 flex-1 space-y-2.5">
              <!-- Title + classification -->
              <div class="flex items-start justify-between gap-3">
                <h3 class="min-w-0 flex-1 text-sm font-semibold leading-snug">{{ r.signal.title || r.proposal.proposed_spec?.title }}</h3>
                <Badge variant="secondary" class="shrink-0 capitalize">{{ r.signal.classification }}</Badge>
              </div>

              <!-- Problem -->
              <p class="text-sm leading-relaxed text-muted-foreground">{{ r.signal.problem }}</p>

              <!-- Why this routing — collapsed by default so it doesn't dominate -->
              <div v-if="r.proposal.rationale">
                <button type="button" class="flex items-center gap-1 text-xs font-medium text-muted-foreground/70 transition-colors hover:text-foreground" @click="r.showWhy = !r.showWhy">
                  <ChevronRight class="size-3 transition-transform" :class="r.showWhy ? 'rotate-90' : ''" /> Pourquoi ce routage
                </button>
                <p v-if="r.showWhy" class="mt-1.5 border-l-2 pl-3 text-xs italic leading-relaxed text-muted-foreground/80">{{ r.proposal.rationale }}</p>
              </div>

              <!-- Action row: status badge (standalone) + flags + a separate "Modifier" control -->
              <div class="flex flex-wrap items-center gap-2 border-t pt-2.5">
                <Badge :variant="r.action === 'create_feature' ? 'default' : 'secondary'">{{ ACTION_LABEL[r.action] }}</Badge>
                <span v-if="r.action === 'append'" class="min-w-0 max-w-[14rem] truncate text-xs text-muted-foreground">→ {{ candTitle(r.target) }}</span>
                <Badge v-if="r.wasDiscard" variant="outline" class="border-muted-foreground/40 text-muted-foreground">déjà couvert</Badge>
                <Badge v-if="r.duplicate_of" variant="outline" class="border-amber-500/40 text-amber-500">doublon possible</Badge>
                <DropdownMenu>
                  <DropdownMenuTrigger as-child>
                    <Button variant="ghost" size="sm" class="ml-auto h-7 gap-1.5 text-muted-foreground"><Pencil class="size-3.5" /> Modifier</Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem class="gap-2" @select="r.action = 'create_feature'; r.target = null"><Plus class="size-3.5" /> Nouvelle feature</DropdownMenuItem>
                    <DropdownMenuItem v-for="c in r.proposal.candidates" :key="c.feature_id" class="gap-2" @select="r.action = 'append'; r.target = c.feature_id">
                      → {{ c.title }} <span class="ml-auto font-mono text-xs text-muted-foreground">{{ (c.similarity * 100) | 0 }}%</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  </div>
</template>
