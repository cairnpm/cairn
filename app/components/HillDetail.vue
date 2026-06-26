<script setup lang="ts">
import { computed } from 'vue'
import { ExternalLink } from 'lucide-vue-next'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { HillDetailData } from '~/types/hill'

const props = defineProps<{ data: HillDetailData; compact?: boolean }>()
const emit = defineEmits<{ 'select-feature': [featureId: string] }>()

function shortId(id: string) { const m = id.match(/hill-(\d+)/); return m ? `H-${m[1]}` : id.slice(0, 4).toUpperCase() }
const done = computed(() => props.data.features.filter(f => f.status === 'done').length)
const total = computed(() => props.data.features.length)
const pct = computed(() => total.value ? Math.round((done.value / total.value) * 100) : 0)
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- Header (border-b) -->
    <header class="flex flex-col gap-3 border-b px-6 py-4">
      <div class="flex items-start justify-between gap-3">
        <div class="flex items-center gap-2" :class="compact ? 'pr-24' : ''">
          <span class="font-mono text-xs text-muted-foreground">{{ shortId(data.hill.id) }}</span>
          <h2 class="text-base font-semibold tracking-tight">{{ data.hill.name }}</h2>
        </div>
        <div class="flex items-center gap-2" :class="compact ? 'mr-24' : ''"><slot name="header-action" /></div>
      </div>
      <div class="flex flex-wrap items-center gap-x-6 gap-y-2">
        <MetaField label="Statut"><StatusBadge :status="data.hill.status" /></MetaField>
        <MetaField label="Avancement">
          <div class="flex items-center gap-2">
            <div class="h-1.5 w-24 overflow-hidden rounded-full bg-muted"><div class="h-full rounded-full bg-primary" :style="{ width: pct + '%' }" /></div>
            <span class="tabular-nums">{{ pct }}% · {{ done }}/{{ total }}</span>
          </div>
        </MetaField>
        <MetaField label="Features"><span class="tabular-nums">{{ total }}</span></MetaField>
        <MetaField label="Période"><span class="text-muted-foreground">{{ data.hill.starts_at || '—' }} → {{ data.hill.ends_at || '—' }}</span></MetaField>
        <MetaField v-if="data.betting_table" label="Source">
          <NuxtLink :to="`/betting/${data.betting_table.id}`" class="inline-flex items-center gap-1 hover:underline">
            {{ data.betting_table.title }}
            <ExternalLink class="size-3.5 opacity-60" />
          </NuxtLink>
        </MetaField>
      </div>
    </header>

    <!-- Features -->
    <ScrollArea class="min-h-0 flex-1">
      <div class="p-6">
        <div v-if="data.hill.rationale" class="mb-6">
          <div class="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Pourquoi ce cycle</div>
          <p class="rounded-md border bg-muted/40 p-3 text-sm leading-relaxed">{{ data.hill.rationale }}</p>
        </div>
        <div class="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Features pariées ({{ total }})</div>
        <div class="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Feature</TableHead>
                <TableHead class="w-24">Statut</TableHead>
                <TableHead>Pari</TableHead>
                <TableHead class="w-24">Par</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="f in data.features" :key="f.id" class="cursor-pointer transition-colors hover:bg-muted/60" @click="emit('select-feature', f.id)">
                <TableCell class="font-medium">{{ f.title }}</TableCell>
                <TableCell><StatusBadge :status="f.status" /></TableCell>
                <TableCell class="text-muted-foreground text-xs">{{ f.decision?.rationale || '—' }}</TableCell>
                <TableCell @click.stop>
                  <div v-if="f.decision" class="flex items-center gap-1.5 text-xs"><UserAvatar :name="f.decision.decided_by" class="size-5" />{{ f.decision.decided_by }}</div>
                </TableCell>
              </TableRow>
              <TableRow v-if="!data.features.length"><TableCell :colspan="4" class="h-24 text-center text-muted-foreground">Aucune feature pariée.</TableCell></TableRow>
            </TableBody>
          </Table>
        </div>
      </div>
    </ScrollArea>
  </div>
</template>
