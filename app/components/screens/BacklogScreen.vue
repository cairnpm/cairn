<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ChevronDown, ChevronsUpDown, ChevronUp, Columns3, Table as TableIcon } from 'lucide-vue-next'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'

interface Feature {
  id: string; title: string; problem: string; appetite: string | null
  status: string; stale: number; hill_id: string | null; hill_name: string | null
  signal_count: number; updated_at: string
}

const bike = useBicycle()
const { statusFilter, view, sortKey, sortDir, selectedFeatureId } = bike

// Always refetch on navigation (the backlog changes whenever the gateway writes).
const { data: features } = await useFetch<Feature[]>('/api/features', { getCachedData: () => undefined })

const S_COLORS: Record<string, [string, string]> = {
  shaped: ['#eff6ff', '#1d4ed8'], bet: ['#fef9c3', '#854d0e'],
  building: ['#fff7ed', '#c2410c'], done: ['#f0fdf4', '#15803d'],
  raw: ['#f4f4f5', '#71717a'], archived: ['#f4f4f5', '#a1a1aa'],
}
const sc = (s: string) => S_COLORS[s] || ['#f4f4f5', '#71717a']

const STATUSES = ['all', 'shaped', 'bet', 'building', 'done']
const STATUS_RANK: Record<string, number> = { raw: 0, shaped: 1, bet: 2, building: 3, done: 4, archived: 5 }
const APPETITE_RANK: Record<string, number> = { small: 0, big: 1 }

// Relative time (collaborative feeds read better as "il y a 3h" than ISO).
function relTime(iso: string): string {
  const d = Date.parse(iso)
  if (Number.isNaN(d)) return '—'
  const s = Math.floor((Date.now() - d) / 1000)
  if (s < 60) return 'à l\'instant'
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`
  if (s < 2592000) return `il y a ${Math.floor(s / 86400)} j`
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

const stats = computed(() => {
  const f = features.value || []
  return [
    { label: 'Total', count: f.length },
    { label: 'Shaped', count: f.filter(x => x.status === 'shaped').length },
    { label: 'Bet', count: f.filter(x => x.status === 'bet').length },
    { label: 'Done', count: f.filter(x => x.status === 'done').length },
  ]
})

const visible = computed(() => {
  let list = (features.value || []).slice()
  if (statusFilter.value !== 'all') list = list.filter(f => f.status === statusFilter.value)
  if (sortKey.value) {
    const dir = sortDir.value === 'asc' ? 1 : -1
    list.sort((a, b) => {
      const k = sortKey.value!
      let r = 0
      if (k === 'title') r = a.title.localeCompare(b.title)
      else if (k === 'status') r = (STATUS_RANK[a.status] ?? 0) - (STATUS_RANK[b.status] ?? 0)
      else if (k === 'appetite') r = (APPETITE_RANK[a.appetite || 'small'] ?? 0) - (APPETITE_RANK[b.appetite || 'small'] ?? 0)
      else if (k === 'signal') r = a.signal_count - b.signal_count
      else if (k === 'hill') r = (a.hill_name || '').localeCompare(b.hill_name || '', undefined, { numeric: true })
      else if (k === 'updated') r = a.updated_at.localeCompare(b.updated_at)
      return r * dir
    })
  }
  return list
})

const PIPELINE = ['shaped', 'bet', 'building', 'done']
const pipeline = computed(() => PIPELINE
  .filter(s => statusFilter.value === 'all' || statusFilter.value === s)
  .map(status => ({ status, items: visible.value.filter(f => f.status === status) })))

const columns = [
  { key: 'title', label: 'Feature' },
  { key: 'status', label: 'Statut' },
  { key: 'appetite', label: 'Appétit' },
  { key: 'signal', label: 'Signaux' },
  { key: 'hill', label: 'Hill' },
  { key: 'updated', label: 'Modifié' },
]

// Detail Sheet
interface FeatureFull extends Feature {
  solution: string | null; rabbit_holes: string | null; out_of_bounds: string | null; created_at: string
}
interface FeatureEvent { seq: number; actor: string; actor_type: string; action: string; summary: string; detail: string | null; created_at: string }
interface Detail {
  feature: FeatureFull & { hill_name: string | null }
  feedback: { id: string; content: string; source: string; classification: string; created_at: string }[]
  decisions: { id: string; verdict: string; rationale: string; decided_by: string | null; decided_at: string }[]
  pr_links: { id: string; repo: string; pr_number: number; pr_url: string; status: string }[]
  events: FeatureEvent[]
  routing_log: { id: string; action: string; confidence: number; rationale: string; created_at: string }[]
}

function eventDetailText(e: FeatureEvent): string {
  if (!e.detail) return ''
  try {
    const d = JSON.parse(e.detail) as Record<string, unknown>
    if (typeof d.content === 'string') return d.content
    if (typeof d.rationale === 'string') return d.rationale
    if (typeof d.before === 'string' || typeof d.after === 'string') return `« ${d.before ?? '∅'} » → « ${d.after ?? '∅'} »`
    return ''
  } catch { return '' }
}
const detail = ref<Detail | null>(null)
watch(selectedFeatureId, async (id) => {
  detail.value = null
  if (id) detail.value = await $fetch<Detail>(`/api/features/${id}`)
})
const open = computed({
  get: () => selectedFeatureId.value !== null,
  set: (v: boolean) => { if (!v) bike.clearFeature() },
})
</script>

<template>
  <div style="display: flex; flex-direction: column; gap: 16px;">
    <!-- Stats -->
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;">
      <div v-for="s in stats" :key="s.label" style="background: white; border: 1px solid #e4e4e7; border-radius: 8px; padding: 16px 18px;">
        <div style="font-size: 12px; color: #71717a; font-weight: 500; margin-bottom: 6px;">{{ s.label }}</div>
        <div style="font-size: 28px; font-weight: 700; color: #18181b; line-height: 1;">{{ s.count }}</div>
      </div>
    </div>

    <!-- Filter + view selector -->
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
      <Tabs :model-value="statusFilter" @update:model-value="bike.setStatusFilter(String($event))">
        <TabsList>
          <TabsTrigger v-for="s in STATUSES" :key="s" :value="s">{{ s === 'all' ? 'Tous' : s.charAt(0).toUpperCase() + s.slice(1) }}</TabsTrigger>
        </TabsList>
      </Tabs>
      <Tabs :model-value="view" @update:model-value="bike.setView($event === 'pipeline' ? 'pipeline' : 'table')">
        <TabsList>
          <TabsTrigger value="table"><TableIcon /> Tableau</TabsTrigger>
          <TabsTrigger value="pipeline"><Columns3 /> Pipeline</TabsTrigger>
        </TabsList>
      </Tabs>
    </div>

    <!-- Table -->
    <div v-if="view === 'table'" style="background: white; border: 1px solid #e4e4e7; border-radius: 8px; overflow: hidden;">
      <Table>
        <TableHeader>
          <TableRow style="background: #fafafa;" class="hover:bg-transparent">
            <TableHead v-for="col in columns" :key="col.key" class="select-none cursor-pointer" style="padding: 11px 16px; font-size: 11px; font-weight: 500; color: #71717a; letter-spacing: 0.05em; text-transform: uppercase; height: auto;" @click="bike.toggleSort(col.key)">
              <span style="display: inline-flex; align-items: center; gap: 4px;">
                {{ col.label }}
                <ChevronUp v-if="sortKey === col.key && sortDir === 'asc'" style="width: 13px; height: 13px;" />
                <ChevronDown v-else-if="sortKey === col.key && sortDir === 'desc'" style="width: 13px; height: 13px;" />
                <ChevronsUpDown v-else style="width: 13px; height: 13px; color: #d4d4d8;" />
              </span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="f in visible" :key="f.id" class="bk-row" :style="{ cursor: 'pointer', borderBottom: '1px solid #f4f4f5' }" @click="bike.selectFeature(f.id)">
            <TableCell style="padding: 14px 16px;">
              <div style="font-weight: 500; color: #18181b; margin-bottom: 2px; display: flex; align-items: center; gap: 6px;">
                {{ f.title }}
                <span v-if="f.stale" style="font-size: 10px; padding: 1px 6px; background: #fef2f2; color: #dc2626; border-radius: 4px;">stale</span>
              </div>
              <div style="font-size: 12px; color: #a1a1aa; max-width: 420px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ f.problem }}</div>
            </TableCell>
            <TableCell style="padding: 14px 16px;"><span :style="{ display: 'inline-flex', padding: '3px 9px', borderRadius: '99px', fontSize: '12px', fontWeight: 500, background: sc(f.status)[0], color: sc(f.status)[1] }">{{ f.status }}</span></TableCell>
            <TableCell style="padding: 14px 16px;"><span style="display: inline-flex; padding: 3px 8px; border-radius: 5px; font-size: 12px; font-weight: 600; background: #f4f4f5; color: #71717a; font-family: 'Courier New', monospace;">{{ f.appetite || '—' }}</span></TableCell>
            <TableCell style="padding: 14px 16px; font-size: 13px; color: #18181b; font-weight: 600;">{{ f.signal_count }}</TableCell>
            <TableCell style="padding: 14px 16px; font-size: 13px; color: #71717a;">{{ f.hill_name || '—' }}</TableCell>
            <TableCell style="padding: 14px 16px; font-size: 13px; color: #a1a1aa; white-space: nowrap;">{{ relTime(f.updated_at) }}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>

    <!-- Pipeline -->
    <div v-else style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; align-items: start;">
      <div v-for="col in pipeline" :key="col.status" style="background: #fafafa; border: 1px solid #e4e4e7; border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 10px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span :style="{ display: 'inline-flex', padding: '3px 9px', borderRadius: '99px', fontSize: '12px', fontWeight: 500, background: sc(col.status)[0], color: sc(col.status)[1] }">{{ col.status }}</span>
          <span style="font-size: 12px; color: #a1a1aa; font-weight: 500;">{{ col.items.length }}</span>
        </div>
        <div v-for="f in col.items" :key="f.id" class="bk-pcard" style="background: white; border: 1px solid #e4e4e7; border-radius: 8px; padding: 14px; cursor: pointer; transition: box-shadow 0.15s, border-color 0.15s;" @click="bike.selectFeature(f.id)">
          <div style="font-size: 14px; font-weight: 600; color: #18181b; line-height: 1.35; margin-bottom: 8px;">{{ f.title }}</div>
          <div style="display: flex; gap: 6px; flex-wrap: wrap; align-items: center;">
            <span style="display: inline-flex; padding: 3px 8px; border-radius: 5px; font-size: 12px; font-weight: 600; background: #f4f4f5; color: #71717a; font-family: 'Courier New', monospace;">{{ f.appetite || '—' }}</span>
            <span style="font-size: 12px; color: #71717a;">{{ f.signal_count }} signaux</span>
            <span style="margin-left: auto; font-size: 12px; color: #71717a;">{{ f.hill_name || '' }}</span>
          </div>
        </div>
        <div v-if="!col.items.length" style="font-size: 13px; color: #a1a1aa; text-align: center; padding: 16px 0;">—</div>
      </div>
    </div>

    <!-- Detail Sheet -->
    <Sheet v-model:open="open">
      <SheetContent class="w-full sm:max-w-md p-0 gap-0" style="overflow-y: auto;">
        <template v-if="detail">
          <SheetHeader style="padding: 16px 20px; border-bottom: 1px solid #f4f4f5;">
            <SheetTitle style="font-size: 15px; font-weight: 600; color: #18181b; line-height: 1.4; padding-right: 24px;">{{ detail.feature.title }}</SheetTitle>
            <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px;">
              <span :style="{ display: 'inline-flex', padding: '3px 9px', borderRadius: '99px', fontSize: '12px', fontWeight: 500, background: sc(detail.feature.status)[0], color: sc(detail.feature.status)[1] }">{{ detail.feature.status }}</span>
              <span style="font-size: 12px; padding: 3px 8px; background: #f4f4f5; color: #71717a; border-radius: 5px; font-family: 'Courier New', monospace;">{{ detail.feature.appetite || '—' }}</span>
              <span v-if="detail.feature.hill_name" style="font-size: 12px; color: #71717a; padding: 3px 0;">{{ detail.feature.hill_name }}</span>
            </div>
            <div style="font-size: 12px; color: #a1a1aa; margin-top: 6px;">Modifié {{ relTime(detail.feature.updated_at) }}</div>
          </SheetHeader>

          <!-- Shape Up pitch -->
          <div style="padding: 14px 20px; border-bottom: 1px solid #f4f4f5;">
            <div style="font-size: 11px; font-weight: 500; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 6px;">Problème</div>
            <div style="font-size: 14px; color: #18181b; line-height: 1.6;">{{ detail.feature.problem }}</div>
          </div>
          <div v-if="detail.feature.solution" style="padding: 14px 20px; border-bottom: 1px solid #f4f4f5;">
            <div style="font-size: 11px; font-weight: 500; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 6px;">Solution esquissée</div>
            <div style="font-size: 14px; color: #18181b; line-height: 1.6;">{{ detail.feature.solution }}</div>
          </div>
          <div v-if="detail.feature.rabbit_holes" style="padding: 14px 20px; border-bottom: 1px solid #f4f4f5;">
            <div style="font-size: 11px; font-weight: 500; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 6px;">Rabbit holes</div>
            <div style="font-size: 14px; color: #18181b; line-height: 1.6;">{{ detail.feature.rabbit_holes }}</div>
          </div>
          <div v-if="detail.feature.out_of_bounds" style="padding: 14px 20px; border-bottom: 1px solid #f4f4f5;">
            <div style="font-size: 11px; font-weight: 500; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 6px;">No-gos (hors-périmètre)</div>
            <div style="font-size: 14px; color: #18181b; line-height: 1.6;">{{ detail.feature.out_of_bounds }}</div>
          </div>

          <div style="padding: 14px 20px; border-bottom: 1px solid #f4f4f5;">
            <div style="font-size: 11px; font-weight: 500; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 10px;">Signaux ({{ detail.feedback.length }})</div>
            <div v-for="fb in detail.feedback" :key="fb.id" style="padding: 8px 0; border-top: 1px solid #f9f9f9;">
              <div style="font-size: 13px; color: #18181b; line-height: 1.5;">{{ fb.content }}</div>
              <div style="font-size: 11px; color: #a1a1aa; margin-top: 2px;">{{ fb.source }} · {{ fb.classification }}</div>
            </div>
          </div>

          <div v-if="detail.decisions.length" style="padding: 14px 20px; border-bottom: 1px solid #f4f4f5;">
            <div style="font-size: 11px; font-weight: 500; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 10px;">Décisions</div>
            <div v-for="d in detail.decisions" :key="d.id" style="padding: 8px 0; border-top: 1px solid #f9f9f9;">
              <div style="font-size: 13px; color: #18181b;"><strong>{{ d.verdict }}</strong> — {{ d.rationale }}</div>
              <div style="font-size: 11px; color: #a1a1aa; margin-top: 2px;">{{ d.decided_by || '—' }}</div>
            </div>
          </div>

          <div v-if="detail.pr_links.length" style="padding: 14px 20px; border-bottom: 1px solid #f4f4f5;">
            <div style="font-size: 11px; font-weight: 500; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 8px;">PR GitHub</div>
            <a v-for="p in detail.pr_links" :key="p.id" :href="p.pr_url" style="display: block; font-size: 13px; color: #2563eb; text-decoration: none; font-family: 'Courier New', monospace; padding: 2px 0;">{{ p.repo }}#{{ p.pr_number }} · {{ p.status }}</a>
          </div>

          <!-- Collaborative activity feed: who changed what, when -->
          <div v-if="detail.events.length" style="padding: 14px 20px;">
            <div style="font-size: 11px; font-weight: 500; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 14px;">Activité</div>
            <div v-for="(e, i) in detail.events" :key="e.seq" style="display: flex; gap: 10px; padding-bottom: 14px; position: relative;">
              <!-- timeline rail -->
              <div v-if="i < detail.events.length - 1" style="position: absolute; left: 13px; top: 28px; bottom: 0; width: 1px; background: #f0f0f0;" />
              <div :style="{ width: '28px', height: '28px', borderRadius: '50%', background: actorAvatar(e.actor).bg, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, flexShrink: 0, zIndex: 1 }">{{ actorAvatar(e.actor).init }}</div>
              <div style="flex: 1; min-width: 0;">
                <div style="font-size: 13px; color: #18181b; line-height: 1.45;">{{ e.summary }}</div>
                <div v-if="eventDetailText(e)" style="font-size: 12px; color: #71717a; line-height: 1.45; margin-top: 2px; border-left: 2px solid #f0f0f0; padding-left: 8px;">{{ eventDetailText(e) }}</div>
                <div style="font-size: 11px; color: #a1a1aa; margin-top: 3px;">{{ relTime(e.created_at) }}</div>
              </div>
            </div>
          </div>
        </template>
      </SheetContent>
    </Sheet>
  </div>
</template>

<style scoped>
.bk-row:hover { background: #fafafa !important; }
.bk-pcard:hover { border-color: #d4d4d8 !important; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
a:hover { text-decoration: underline !important; }
</style>
