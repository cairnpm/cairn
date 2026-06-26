<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChevronRight, Plus } from 'lucide-vue-next'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'

interface TableRowT {
  id: string; title: string; status: string; owner_name: string | null
  hill_id: string | null; validated_at: string | null; validated_by: string | null
  candidate_count: number; voter_count: number; vote_count: number
}

const bike = useBicycle()
const { role } = bike
const { data: tables } = await useFetch<TableRowT[]>('/api/betting-tables', { getCachedData: getFreshData })
const creating = ref(false)

async function createTable() {
  if (creating.value) return
  creating.value = true
  try {
    const r = await $fetch<{ id: string }>('/api/betting-tables', { method: 'POST', body: { title: '' } })
    await bike.selectBettingTable(r.id)
  } finally { creating.value = false }
}

const stats = computed(() => {
  const t = tables.value || []
  return {
    open: t.filter(x => x.status === 'open').length,
    candidates: t.reduce((s, x) => s + (x.candidate_count || 0), 0),
    conv: t.length ? Math.round((t.filter(x => x.status === 'validated').length / t.length) * 100) + '%' : '0%',
  }
})
</script>

<template>
  <div class="flex h-full flex-col gap-4 overflow-auto p-4">
    <div class="grid grid-cols-3 gap-3">
      <Card v-for="s in [{ l: 'Tables ouvertes', n: stats.open }, { l: 'Candidats', n: stats.candidates }, { l: 'Taux conversion', n: stats.conv }]" :key="s.l" class="py-0">
        <CardContent class="px-4 py-3">
          <div class="text-xs font-medium text-muted-foreground uppercase tracking-wide">{{ s.l }}</div>
          <div class="text-2xl font-semibold tabular-nums">{{ s.n }}</div>
        </CardContent>
      </Card>
    </div>

    <div class="flex items-center justify-between">
      <h2 class="text-sm font-medium text-muted-foreground">Tables — les membres votent, l'owner valide → un cycle naît</h2>
      <Button size="sm" :disabled="creating" @click="createTable"><Plus class="size-4" /> {{ creating ? 'Génération…' : 'Nouvelle table' }}</Button>
    </div>

    <div class="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Table</TableHead>
            <TableHead class="w-28">Statut</TableHead>
            <TableHead class="w-24 text-right">Candidats</TableHead>
            <TableHead class="w-20 text-right">Votes</TableHead>
            <TableHead class="w-28">Owner</TableHead>
            <TableHead class="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="t in tables" :key="t.id" class="cursor-pointer" @click="bike.selectBettingTable(t.id)">
            <TableCell>
              <div class="font-medium">{{ t.title }}</div>
              <div v-if="t.hill_id" class="text-xs text-muted-foreground">→ cycle créé</div>
            </TableCell>
            <TableCell><StatusBadge :status="t.status" /></TableCell>
            <TableCell class="text-right tabular-nums">{{ t.candidate_count }}</TableCell>
            <TableCell class="text-right tabular-nums">{{ t.vote_count }}</TableCell>
            <TableCell class="text-muted-foreground">{{ t.owner_name }}</TableCell>
            <TableCell><ChevronRight class="size-4 text-muted-foreground" /></TableCell>
          </TableRow>
          <TableRow v-if="!tables?.length">
            <TableCell :colspan="6" class="h-24 text-center text-muted-foreground">Aucune table. Générez-en une.</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>

    <p v-if="role !== 'owner'" class="text-xs text-muted-foreground">Vous pouvez voter ; seul l'owner valide une table.</p>
  </div>
</template>
