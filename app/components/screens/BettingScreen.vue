<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Check } from 'lucide-vue-next'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'

interface Candidate { feature_id: string; title: string; problem: string; appetite: string | null; signal_count: number; age_days: number; score: number; theme?: string }
interface Cluster { theme: string; score: number; candidates: Candidate[] }
interface Menu { generated_at: string; total_candidates: number; theme_count: number; menu: Cluster[] }
interface Hill { id: string; name: string; status: string }

const bike = useBicycle()
const { team, selectedBetId, author } = bike

const { data: hills } = await useFetch<Hill[]>('/api/hills')
const menu = ref<Menu | null>(null)
const generating = ref(false)
const why = ref('')

// Local shortlist (the "vote"): which candidates the CEO is eyeing for the cycle.
const selected = useState<string[]>('bike-bet-shortlist', () => [])
function toggleSelect(id: string) {
  selected.value = selected.value.includes(id) ? selected.value.filter(x => x !== id) : [...selected.value, id]
}

async function generate() {
  generating.value = true
  try { menu.value = await $fetch<Menu>('/api/betting-table/generate') }
  finally { generating.value = false }
}

const candidates = computed<Candidate[]>(() =>
  (menu.value?.menu || []).flatMap(c => c.candidates.map(x => ({ ...x, theme: c.theme }))),
)

// Derive an impact label/colour from the gateway score (recency·signals·appetite·decision).
function impact(score: number): [string, string, string] {
  if (score >= 2.5) return ['Très haute', '#fef2f2', '#dc2626']
  if (score >= 1.5) return ['Haute', '#fff7ed', '#c2410c']
  if (score >= 0.8) return ['Moyenne', '#eff6ff', '#1d4ed8']
  return ['Basse', '#f0fdf4', '#15803d']
}

// Detail Sheet + decision
interface Detail {
  feature: { id: string; title: string; problem: string; appetite: string | null; solution: string | null; rabbit_holes: string | null; out_of_bounds: string | null; status: string }
  feedback: { id: string; content: string; source: string; classification: string }[]
  decisions: { id: string; verdict: string; rationale: string; decided_by: string | null }[]
}
const detail = ref<Detail | null>(null)
const verdict = ref<'bet' | 'pass' | 'defer'>('bet')
const rationale = ref('')
const hillId = ref('')
const submitting = ref(false)

watch(selectedBetId, async (id) => {
  detail.value = null
  rationale.value = ''
  verdict.value = 'bet'
  hillId.value = hills.value?.find(h => h.status === 'active')?.id || hills.value?.[0]?.id || ''
  if (id) detail.value = await $fetch<Detail>(`/api/features/${id}`)
})
const open = computed({
  get: () => selectedBetId.value !== null,
  set: (v: boolean) => { if (!v) bike.clearBet() },
})

async function submit() {
  if (!detail.value || submitting.value || !rationale.value.trim()) return
  submitting.value = true
  try {
    await $fetch('/api/decisions', {
      method: 'POST',
      body: { feature_id: detail.value.feature.id, verdict: verdict.value, rationale: rationale.value, hill_id: verdict.value === 'bet' ? hillId.value : null, decided_by: author.value },
    })
    selected.value = selected.value.filter(x => x !== detail.value!.feature.id)
    bike.clearBet()
    await generate()
  } finally {
    submitting.value = false
  }
}

const verdictColor = (v: string) => v === 'bet' ? ['#f0fdf4', '#15803d', '#bbf7d0'] : v === 'defer' ? ['#fff7ed', '#c2410c', '#fed7aa'] : ['#fef2f2', '#dc2626', '#fecaca']
</script>

<template>
  <div style="display: flex; flex-direction: column; gap: 20px;">
    <!-- Cycle header -->
    <div style="background: white; border: 1px solid #e4e4e7; border-radius: 8px; padding: 16px 20px; display: flex; align-items: center; gap: 24px;">
      <div style="flex: 1;">
        <div style="font-size: 11px; color: #a1a1aa; font-weight: 500; text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 4px;">Cycle actif</div>
        <div style="font-size: 18px; font-weight: 700; color: #18181b;">{{ hills?.find(h => h.status === 'active')?.name || 'Aucun cycle actif' }}</div>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <div style="display: flex;">
          <div v-for="m in team" :key="m.init" :title="m.name" :style="{ width: '30px', height: '30px', borderRadius: '50%', background: m.bg, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 600, border: '2px solid white', marginLeft: '-6px' }">{{ m.init }}</div>
        </div>
        <span style="font-size: 13px; color: #71717a;">ont voté</span>
      </div>
      <div style="font-size: 20px; font-weight: 700; color: #18181b; padding-left: 12px; border-left: 1px solid #e4e4e7;">{{ selected.length }} sél.</div>
      <button class="bk-dark" :disabled="generating" style="padding: 8px 16px; background: #18181b; color: white; border: none; border-radius: 7px; font-size: 14px; font-weight: 500; cursor: pointer; font-family: inherit;" @click="generate">{{ generating ? 'Génération…' : (menu ? '↻ Regénérer' : 'Générer') }}</button>
    </div>

    <!-- Empty -->
    <div v-if="!menu" style="background: white; border: 1px dashed #e4e4e7; border-radius: 8px; padding: 48px; text-align: center; color: #a1a1aa; font-size: 14px;">
      Génère un menu rangé des features <code>shaped</code>, clusterisées par thème. Le menu prépare — le pari reste humain.
    </div>

    <!-- Candidates -->
    <template v-else>
      <div>
        <div style="font-size: 11px; font-weight: 500; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 12px;">Candidats — cliquez pour voter, ouvrez pour décider</div>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;">
          <div
            v-for="c in candidates"
            :key="c.feature_id"
            class="bk-card"
            :style="{ background: 'white', border: selected.includes(c.feature_id) ? '2px solid #18181b' : '1px solid #e4e4e7', borderRadius: '8px', padding: '16px', cursor: 'pointer', transition: 'box-shadow 0.15s', position: 'relative', display: 'flex', flexDirection: 'column' }"
            @click="bike.selectBet(c.feature_id)"
          >
            <!-- Vote toggle — check button, greyed when inactive (does not open the detail) -->
            <button
              :title="selected.includes(c.feature_id) ? 'Sélectionné' : 'Voter pour cette feature'"
              :aria-pressed="selected.includes(c.feature_id)"
              :style="{ position: 'absolute', top: '12px', right: '12px', width: '22px', height: '22px', borderRadius: '50%', border: selected.includes(c.feature_id) ? 'none' : '1px solid #e4e4e7', background: selected.includes(c.feature_id) ? '#18181b' : '#f4f4f5', color: selected.includes(c.feature_id) ? 'white' : '#d4d4d8', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0, transition: 'background 0.15s, color 0.15s' }"
              @click.stop="toggleSelect(c.feature_id)"
            >
              <Check style="width: 13px; height: 13px;" :stroke-width="3" />
            </button>

            <!-- Voters: the CEO avatar appears once selected -->
            <div style="display: flex; gap: 3px; margin-bottom: 12px; min-height: 22px;">
              <div v-if="selected.includes(c.feature_id)" title="CEO (vous)" style="width: 22px; height: 22px; border-radius: 50%; background: #18181b; color: white; display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 700;">C</div>
            </div>

            <div style="font-size: 14px; font-weight: 600; color: #18181b; margin-bottom: 5px; line-height: 1.3; padding-right: 28px;">{{ c.title }}</div>
            <div style="font-size: 13px; color: #71717a; line-height: 1.5; margin-bottom: 12px;">{{ c.problem }}</div>
            <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: auto;">
              <span style="font-size: 12px; padding: 2px 8px; background: #f4f4f5; color: #71717a; border-radius: 4px; font-weight: 500;">{{ c.appetite }} · {{ c.signal_count }} sig.</span>
              <span :style="{ fontSize: '12px', padding: '2px 8px', background: impact(c.score)[1], color: impact(c.score)[2], borderRadius: '4px', fontWeight: 500 }">{{ impact(c.score)[0] }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Why now -->
      <div style="background: white; border: 1px solid #e4e4e7; border-radius: 8px; padding: 16px 20px;">
        <div style="font-size: 11px; font-weight: 500; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 10px;">Pourquoi maintenant ?</div>
        <textarea v-model="why" placeholder="Décrivez la rationale de ce cycle..." style="width: 100%; min-height: 88px; padding: 10px 13px; border: 1px solid #e4e4e7; border-radius: 6px; font-family: inherit; font-size: 14px; color: #18181b; resize: none; line-height: 1.6; background: white;" />
      </div>
    </template>

    <!-- Decision Sheet -->
    <Sheet v-model:open="open">
      <SheetContent class="w-full sm:max-w-md p-0 gap-0" style="overflow-y: auto;">
        <template v-if="detail">
          <SheetHeader style="padding: 16px 20px; border-bottom: 1px solid #f4f4f5;">
            <SheetTitle style="font-size: 15px; font-weight: 600; color: #18181b; line-height: 1.4; padding-right: 24px;">{{ detail.feature.title }}</SheetTitle>
            <span style="font-size: 12px; padding: 3px 8px; background: #f4f4f5; color: #71717a; border-radius: 5px; font-family: 'Courier New', monospace; width: fit-content; margin-top: 4px;">appétit {{ detail.feature.appetite || '—' }}</span>
          </SheetHeader>

          <!-- Pitch context for the bet -->
          <div style="padding: 14px 20px; border-bottom: 1px solid #f4f4f5; display: flex; flex-direction: column; gap: 12px;">
            <div>
              <div style="font-size: 11px; font-weight: 500; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 4px;">Problème</div>
              <div style="font-size: 13px; color: #18181b; line-height: 1.6;">{{ detail.feature.problem }}</div>
            </div>
            <div v-if="detail.feature.solution">
              <div style="font-size: 11px; font-weight: 500; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 4px;">Solution esquissée</div>
              <div style="font-size: 13px; color: #18181b; line-height: 1.6;">{{ detail.feature.solution }}</div>
            </div>
            <div v-if="detail.feature.rabbit_holes">
              <div style="font-size: 11px; font-weight: 500; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 4px;">Rabbit holes</div>
              <div style="font-size: 13px; color: #71717a; line-height: 1.6;">{{ detail.feature.rabbit_holes }}</div>
            </div>
            <div v-if="detail.feature.out_of_bounds">
              <div style="font-size: 11px; font-weight: 500; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 4px;">No-gos</div>
              <div style="font-size: 13px; color: #71717a; line-height: 1.6;">{{ detail.feature.out_of_bounds }}</div>
            </div>
          </div>

          <div style="padding: 14px 20px; border-bottom: 1px solid #f4f4f5;">
            <div style="font-size: 11px; font-weight: 500; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 10px;">Décision</div>
            <div style="display: flex; gap: 6px; margin-bottom: 10px;">
              <button v-for="v in (['bet','pass','defer'] as const)" :key="v" :style="{ flex: 1, padding: '7px', borderRadius: '6px', border: '1px solid ' + (verdict === v ? verdictColor(v)[2] : '#e4e4e7'), background: verdict === v ? verdictColor(v)[0] : 'white', color: verdict === v ? verdictColor(v)[1] : '#71717a', fontSize: '13px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }" @click="verdict = v">{{ v }}</button>
            </div>
            <select v-if="verdict === 'bet'" v-model="hillId" style="width: 100%; padding: 8px 10px; border: 1px solid #e4e4e7; border-radius: 6px; font-size: 13px; font-family: inherit; margin-bottom: 8px; background: white;">
              <option v-for="h in hills" :key="h.id" :value="h.id">{{ h.name }}</option>
            </select>
            <textarea v-model="rationale" placeholder="Pourquoi ce verdict ? (obligatoire)" style="width: 100%; min-height: 72px; padding: 9px 11px; border: 1px solid #e4e4e7; border-radius: 6px; font-family: inherit; font-size: 13px; resize: none; line-height: 1.55; margin-bottom: 10px;" />
            <button class="bk-dark" :disabled="submitting || !rationale.trim()" style="width: 100%; padding: 9px; background: #18181b; color: white; border: none; border-radius: 7px; font-size: 14px; font-weight: 500; cursor: pointer; font-family: inherit;" @click="submit">Confirmer la décision</button>
          </div>

          <div v-if="detail.decisions.length" style="padding: 14px 20px; border-bottom: 1px solid #f4f4f5;">
            <div style="font-size: 11px; font-weight: 500; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 10px;">Historique des paris</div>
            <div v-for="d in detail.decisions" :key="d.id" style="padding: 8px 0; border-top: 1px solid #f9f9f9;">
              <div style="font-size: 13px; color: #18181b;"><strong>{{ d.verdict }}</strong> — {{ d.rationale }}</div>
              <div style="font-size: 11px; color: #a1a1aa; margin-top: 2px;">{{ d.decided_by || '—' }}</div>
            </div>
          </div>

          <div style="padding: 14px 20px;">
            <div style="font-size: 11px; font-weight: 500; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 10px;">Signaux ({{ detail.feedback.length }})</div>
            <div v-for="fb in detail.feedback" :key="fb.id" style="padding: 8px 0; border-top: 1px solid #f9f9f9;">
              <div style="font-size: 13px; color: #18181b; line-height: 1.5;">{{ fb.content }}</div>
              <div style="font-size: 11px; color: #a1a1aa; margin-top: 2px;">{{ fb.source }} · {{ fb.classification }}</div>
            </div>
          </div>
        </template>
      </SheetContent>
    </Sheet>
  </div>
</template>

<style scoped>
.bk-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.07); }
.bk-dark:hover { background: #27272a !important; }
.bk-dark:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
