<script setup lang="ts">
import { computed } from 'vue'
import { ArrowUpRight } from 'lucide-vue-next'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

interface HillRow { id: string; name: string; starts_at: string | null; ends_at: string | null; status: string; total: number; done: number }
interface Feature { id: string; title: string; status: string; pr_links: { repo: string; pr_number: number; pr_url: string; status: string }[]; decision: { verdict: string; rationale: string; decided_by: string | null } | null }
interface BettingTable { id: string; title: string; validated_by: string | null }
interface Detail { hill: HillRow; features: Feature[]; betting_table: BettingTable | null }

const bike = useBicycle()
const { selectedHill } = bike
const { data: hills } = await useFetch<HillRow[]>('/api/hills', { default: () => [], getCachedData: getFreshData })
const { data: detail } = await useFetch<Detail | null>(
  () => selectedHill.value ? `/api/hills/${selectedHill.value}` : '',
  { default: () => null, immediate: !!selectedHill.value, getCachedData: getFreshData },
)

const pct = (h: { total: number; done: number }) => h.total ? Math.round((h.done / h.total) * 100) : 0
function shortId(id: string) { const m = id.match(/hill-(\d+)/); return m ? `H-${m[1]}` : id.slice(0, 4).toUpperCase() }

const kpis = computed(() => {
  const h = hills.value
  const withTotal = h.filter(x => x.total > 0)
  return {
    active: h.filter(x => x.status === 'active').length,
    planned: h.filter(x => x.status === 'planned').length,
    avg: withTotal.length ? Math.round(withTotal.reduce((s, x) => s + pct(x), 0) / withTotal.length) + '%' : '0%',
  }
})

const byMonth = computed(() => {
  const groups: Record<string, HillRow[]> = {}
  for (const h of [...hills.value].sort((a, b) => (a.starts_at || '').localeCompare(b.starts_at || ''))) {
    const key = h.starts_at ? h.starts_at.slice(0, 7) : 'sans date'
    ;(groups[key] ||= []).push(h)
  }
  return groups
})
function monthLabel(key: string) {
  if (key === 'sans date') return 'Sans date'
  const [y, m] = key.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
}
</script>

<template>
  <div class="flex h-full flex-col gap-4 overflow-auto p-4">
    <!-- OVERVIEW -->
    <template v-if="selectedHill === null">
      <div class="grid grid-cols-3 gap-3">
        <Card v-for="k in [{ l: 'Actifs', n: kpis.active }, { l: 'Planifiés', n: kpis.planned }, { l: 'Avancement moyen', n: kpis.avg }]" :key="k.l" class="py-0">
          <CardContent class="px-4 py-3"><div class="text-xs font-medium text-muted-foreground uppercase tracking-wide">{{ k.l }}</div><div class="text-2xl font-semibold tabular-nums">{{ k.n }}</div></CardContent>
        </Card>
      </div>

      <Tabs default-value="list">
        <TabsList>
          <TabsTrigger value="list">Liste</TabsTrigger>
          <TabsTrigger value="calendar">Calendrier</TabsTrigger>
        </TabsList>

        <TabsContent value="list" class="mt-3">
          <div class="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hill</TableHead>
                  <TableHead class="w-28">Statut</TableHead>
                  <TableHead class="w-48">Avancement</TableHead>
                  <TableHead class="w-44">Période</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="h in hills" :key="h.id" class="cursor-pointer" @click="bike.selectHill(h.id)">
                  <TableCell><span class="font-mono text-xs text-muted-foreground mr-2">{{ shortId(h.id) }}</span><span class="font-medium">{{ h.name }}</span></TableCell>
                  <TableCell><StatusBadge :status="h.status" /></TableCell>
                  <TableCell>
                    <div class="flex items-center gap-2">
                      <div class="h-1.5 w-24 overflow-hidden rounded-full bg-muted"><div class="h-full rounded-full bg-primary" :style="{ width: pct(h) + '%' }" /></div>
                      <span class="text-xs text-muted-foreground tabular-nums">{{ h.done }}/{{ h.total }}</span>
                    </div>
                  </TableCell>
                  <TableCell class="text-muted-foreground text-xs">{{ h.starts_at || '—' }} → {{ h.ends_at || '—' }}</TableCell>
                </TableRow>
                <TableRow v-if="!hills.length"><TableCell :colspan="4" class="h-24 text-center text-muted-foreground">Aucune hill.</TableCell></TableRow>
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="calendar" class="mt-3 flex flex-col gap-5">
          <div v-for="(group, month) in byMonth" :key="month">
            <div class="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground capitalize">{{ monthLabel(month as string) }}</div>
            <div class="flex flex-col gap-2">
              <Card v-for="h in group" :key="h.id" class="cursor-pointer py-0 transition-colors hover:bg-accent" @click="bike.selectHill(h.id)">
                <CardContent class="flex items-center gap-3 p-3">
                  <span class="font-mono text-xs text-muted-foreground">{{ shortId(h.id) }}</span>
                  <span class="flex-1 font-medium">{{ h.name }}</span>
                  <span class="text-xs text-muted-foreground">{{ h.starts_at }} → {{ h.ends_at }}</span>
                  <StatusBadge :status="h.status" />
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </template>

    <!-- DETAIL -->
    <template v-else-if="detail">
      <Card class="py-0">
        <CardContent class="flex flex-col gap-3 p-4">
          <div class="flex items-center gap-2">
            <span class="font-mono text-xs text-muted-foreground">{{ shortId(detail.hill.id) }}</span>
            <h1 class="text-lg font-semibold tracking-tight">{{ detail.hill.name }}</h1>
            <StatusBadge :status="detail.hill.status" />
          </div>
          <Separator />
          <div class="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm">
            <div><div class="text-xs text-muted-foreground">Avancement</div><div class="font-medium tabular-nums">{{ pct(detail.hill) }}% · {{ detail.hill.done }}/{{ detail.hill.total }}</div></div>
            <div><div class="text-xs text-muted-foreground">Features</div><div class="font-medium tabular-nums">{{ detail.features.length }}</div></div>
            <div><div class="text-xs text-muted-foreground">Période</div><div class="font-medium">{{ detail.hill.starts_at || '—' }} → {{ detail.hill.ends_at || '—' }}</div></div>
          </div>
          <Button v-if="detail.betting_table" as-child variant="outline" size="sm" class="w-fit">
            <NuxtLink :to="`/betting/${detail.betting_table.id}`"><ArrowUpRight class="size-3.5" /> Issu de « {{ detail.betting_table.title }} » — {{ detail.betting_table.validated_by }}</NuxtLink>
          </Button>
        </CardContent>
      </Card>

      <div class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Features pariées ({{ detail.features.length }})</div>
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
            <TableRow v-for="f in detail.features" :key="f.id">
              <TableCell class="font-medium">{{ f.title }}</TableCell>
              <TableCell><StatusBadge :status="f.status" /></TableCell>
              <TableCell class="text-muted-foreground text-xs">{{ f.decision?.rationale || '—' }}</TableCell>
              <TableCell><div v-if="f.decision" class="flex items-center gap-1.5 text-xs"><UserAvatar :name="f.decision.decided_by" class="size-5" />{{ f.decision.decided_by }}</div></TableCell>
            </TableRow>
            <TableRow v-if="!detail.features.length"><TableCell :colspan="4" class="h-24 text-center text-muted-foreground">Aucune feature pariée.</TableCell></TableRow>
          </TableBody>
        </Table>
      </div>
    </template>
  </div>
</template>
