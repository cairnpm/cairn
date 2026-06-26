<script setup lang="ts">
import { ExternalLink } from 'lucide-vue-next'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import type { BettingTableDetailData } from '~/types/betting'

const props = defineProps<{ data: BettingTableDetailData; compact?: boolean }>()
const emit = defineEmits<{ 'select-feature': [featureId: string] }>()

function impact(score: number) { return score >= 2.5 ? 'Très haute' : score >= 1.5 ? 'Haute' : score >= 0.8 ? 'Moyenne' : 'Basse' }
function relTime(iso: string) {
  const d = Date.parse(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z')
  if (Number.isNaN(d)) return ''
  const s = Math.floor((Date.now() - d) / 1000)
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}min`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}j`
}
const totalVotes = () => props.data.candidates.reduce((s, c) => s + c.voters.length, 0)
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- Header (border-b) -->
    <header class="flex flex-col gap-3 border-b px-6 py-4">
      <div class="flex items-start justify-between gap-3">
        <h2 class="text-base font-semibold tracking-tight" :class="compact ? 'pr-24' : ''">{{ data.table.title }}</h2>
        <div class="flex items-center gap-2" :class="compact ? 'mr-24' : ''">
          <slot name="header-action" />
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-x-6 gap-y-2">
        <MetaField label="Statut"><StatusBadge :status="data.table.status" /></MetaField>
        <MetaField label="Créée par"><UserAvatar :name="data.table.owner_name" class="size-5" />{{ data.table.owner_name }}</MetaField>
        <MetaField label="Candidats"><span class="tabular-nums">{{ data.candidates.length }}</span></MetaField>
        <MetaField label="Votes"><span class="tabular-nums">{{ totalVotes() }}</span></MetaField>
        <MetaField v-if="data.table.validated_by" label="Validée par">{{ data.table.validated_by }}</MetaField>
        <MetaField v-if="data.table.hill_id" label="Hill">
          <NuxtLink :to="`/hills/${data.table.hill_id}`" class="inline-flex items-center gap-1 hover:underline">
            {{ data.table.hill_name || 'Cycle' }}
            <ExternalLink class="size-3.5 opacity-60" />
          </NuxtLink>
        </MetaField>
      </div>
    </header>

    <!-- Two columns -->
    <div class="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[1fr_340px]">
      <!-- Left: candidates -->
      <ScrollArea class="min-h-0">
        <div class="p-6">
          <div class="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Candidats ({{ data.candidates.length }})</div>
          <div class="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidat</TableHead>
                  <TableHead class="w-20">Votes</TableHead>
                  <TableHead class="w-24">Impact</TableHead>
                  <TableHead class="w-28 text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="c in data.candidates" :key="c.id" class="cursor-pointer transition-colors hover:bg-muted/60" @click="emit('select-feature', c.feature_id)">
                  <TableCell>
                    <div class="flex items-center gap-2 font-medium">
                      {{ c.title_snap }}
                      <Badge v-if="c.selected" class="text-[10px]">parié</Badge>
                    </div>
                    <div v-if="!compact" class="text-xs text-muted-foreground truncate max-w-md">{{ c.problem_snap }}</div>
                  </TableCell>
                  <TableCell>
                    <div v-if="c.voters.length" class="flex items-center">
                      <UserAvatar v-for="v in c.voters" :key="v" :name="v" class="-mr-1.5 size-5 ring-2 ring-background" />
                    </div>
                    <span v-else class="text-xs text-muted-foreground">—</span>
                  </TableCell>
                  <TableCell><Badge variant="outline">{{ impact(c.score) }}</Badge></TableCell>
                  <TableCell class="text-right" @click.stop><slot name="candidate-action" :candidate="c" /></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
          <div v-if="$slots['candidates-footer']" class="mt-4 flex justify-end">
            <slot name="candidates-footer" />
          </div>
        </div>
      </ScrollArea>

      <!-- Right: timeline (plain) -->
      <aside class="min-h-0 border-t bg-muted/20 md:border-l md:border-t-0">
        <ScrollArea class="h-full">
          <div class="p-6">
            <div class="mb-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">Timeline ({{ data.events.length }})</div>
            <div class="relative flex flex-col gap-4">
              <div v-for="(e, i) in data.events" :key="e.seq" class="flex gap-2.5">
                <div class="relative flex flex-col items-center">
                  <UserAvatar :name="e.actor" class="size-6 shrink-0" />
                  <div v-if="i < data.events.length - 1" class="mt-1 w-px flex-1 bg-border" />
                </div>
                <div class="min-w-0 pb-1 text-sm">
                  <div class="leading-snug">{{ e.summary }}</div>
                  <div class="mt-0.5 text-xs text-muted-foreground">{{ relTime(e.created_at) }}</div>
                </div>
              </div>
              <div v-if="!data.events.length" class="text-sm text-muted-foreground">Aucune activité.</div>
            </div>
          </div>
        </ScrollArea>
      </aside>
    </div>
  </div>
</template>
