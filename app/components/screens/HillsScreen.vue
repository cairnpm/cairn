<script setup lang="ts">
import { computed } from 'vue'

interface HillRow { id: string; name: string; starts_at: string | null; ends_at: string | null; status: string; total: number; done: number }
interface Feature { id: string; title: string; status: string; pr_links: { repo: string; pr_number: number; pr_url: string; status: string }[]; decision: { verdict: string; rationale: string; decided_by: string | null } | null }
interface Detail { hill: HillRow; features: Feature[] }

const bike = useBicycle()
const { selectedHill } = bike

const H_COLORS: Record<string, [string, string]> = {
  planned: ['#eff6ff', '#1d4ed8'], active: ['#fef9c3', '#854d0e'], closed: ['#f0fdf4', '#15803d'],
}
const hc = (s: string) => H_COLORS[s] || ['#f4f4f5', '#71717a']
const pct = (h: { total: number; done: number }) => h.total ? Math.round((h.done / h.total) * 100) : 0

// Overview (only fetched when no hill selected)
const { data: hills } = await useFetch<HillRow[]>('/api/hills', { default: () => [], getCachedData: () => undefined })

// Detail (fetched when a hill is selected)
const { data: detail } = await useFetch<Detail | null>(
  () => selectedHill.value ? `/api/hills/${selectedHill.value}` : '',
  { default: () => null, immediate: !!selectedHill.value, getCachedData: () => undefined },
)
</script>

<template>
  <!-- Overview -->
  <div v-if="selectedHill === null" style="display: flex; flex-direction: column; gap: 10px;">
    <div v-for="h in hills" :key="h.id" class="bk-hill" style="background: white; border: 1px solid #e4e4e7; border-radius: 8px; padding: 20px; cursor: pointer; transition: box-shadow 0.15s;" @click="bike.selectHill(h.id)">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px;">
        <div>
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
            <span style="font-size: 15px; font-weight: 700; color: #18181b;">{{ h.name }}</span>
            <span :style="{ padding: '2px 9px', borderRadius: '99px', fontSize: '12px', fontWeight: 500, background: hc(h.status)[0], color: hc(h.status)[1] }">{{ h.status }}</span>
          </div>
          <div style="font-size: 13px; color: #71717a;">{{ h.starts_at }} → {{ h.ends_at }}</div>
        </div>
        <div style="text-align: right; flex-shrink: 0; margin-left: 24px;">
          <div :style="{ fontSize: '28px', fontWeight: 800, color: hc(h.status)[1], lineHeight: 1 }">{{ h.total ? pct(h) + '%' : '—' }}</div>
          <div style="font-size: 11px; color: #a1a1aa; margin-top: 1px;">{{ h.done }}/{{ h.total }} done</div>
        </div>
      </div>
      <div v-if="h.total" style="height: 4px; background: #f4f4f5; border-radius: 99px; overflow: hidden;">
        <div :style="{ height: '100%', background: hc(h.status)[1], width: pct(h) + '%' }" />
      </div>
    </div>
    <div v-if="!hills.length" style="color: #a1a1aa; font-size: 14px; padding: 24px; text-align: center;">Aucune hill.</div>
  </div>

  <!-- Detail -->
  <div v-else-if="detail" style="display: flex; flex-direction: column; gap: 20px;">
    <div style="background: white; border: 1px solid #e4e4e7; border-radius: 8px; padding: 20px;">
      <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 4px;">
        <span style="font-size: 18px; font-weight: 700; color: #18181b;">{{ detail.hill.name }}</span>
        <span :style="{ padding: '2px 9px', borderRadius: '99px', fontSize: '12px', fontWeight: 500, background: hc(detail.hill.status)[0], color: hc(detail.hill.status)[1] }">{{ detail.hill.status }}</span>
      </div>
      <div style="font-size: 13px; color: #71717a;">{{ detail.hill.starts_at }} → {{ detail.hill.ends_at }} · {{ detail.hill.done }}/{{ detail.hill.total }} done</div>
    </div>

    <div>
      <div style="font-size: 11px; font-weight: 500; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 12px;">Features pariées</div>
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <div v-for="f in detail.features" :key="f.id" style="background: white; border: 1px solid #e4e4e7; border-radius: 8px; padding: 18px 20px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
            <div style="font-size: 15px; font-weight: 600; color: #18181b;">{{ f.title }}</div>
            <span :style="{ padding: '2px 9px', borderRadius: '99px', fontSize: '12px', fontWeight: 500, background: hc(f.status === 'done' ? 'closed' : 'active')[0], color: hc(f.status === 'done' ? 'closed' : 'active')[1] }">{{ f.status }}</span>
          </div>
          <div v-if="f.decision" style="font-size: 13px; color: #71717a; line-height: 1.5; margin-bottom: 8px;">
            <strong style="color: #18181b;">Pari :</strong> "{{ f.decision.rationale }}" — {{ f.decision.decided_by }}
          </div>
          <a v-for="p in f.pr_links" :key="p.pr_number" :href="p.pr_url" style="font-size: 12px; color: #2563eb; text-decoration: none; font-family: 'Courier New', monospace; margin-right: 12px;">{{ p.repo }}#{{ p.pr_number }} · {{ p.status }}</a>
        </div>
        <div v-if="!detail.features.length" style="color: #a1a1aa; font-size: 14px; padding: 16px; text-align: center;">Aucune feature pariée sur cette hill.</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bk-hill:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.07); border-color: #d4d4d8 !important; }
a:hover { text-decoration: underline !important; }
</style>
