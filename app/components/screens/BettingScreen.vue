<script setup lang="ts">
import { computed } from 'vue'
import { Check } from 'lucide-vue-next'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'

const bike = useBicycle()
const { team, candidates, candidateDetail, selCount, bettingWhy } = bike

const open = computed({
  get: () => candidateDetail.value !== null,
  set: (v: boolean) => { if (!v) bike.clearCandidate() },
})
</script>

<template>
  <div style="display: flex; flex-direction: column; gap: 20px;">
    <!-- Cycle header -->
    <div style="background: white; border: 1px solid #e4e4e7; border-radius: 8px; padding: 16px 20px; display: flex; align-items: center; gap: 24px;">
      <div style="flex: 1;">
        <div style="font-size: 11px; color: #a1a1aa; font-weight: 500; text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 4px;">Prochain cycle</div>
        <div style="font-size: 18px; font-weight: 700; color: #18181b; margin-bottom: 2px;">Hill #12 — 2 semaines</div>
        <div style="font-size: 13px; color: #71717a;">18 juin — 1 juillet 2026</div>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <div style="display: flex;">
          <div v-for="m in team" :key="m.init" :title="m.name" :style="{ width: '30px', height: '30px', borderRadius: '50%', background: m.bg, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 600, border: '2px solid white', marginLeft: '-6px' }">{{ m.init }}</div>
        </div>
        <span style="font-size: 13px; color: #71717a;">ont voté</span>
      </div>
      <div style="font-size: 20px; font-weight: 700; color: #18181b; padding-left: 12px; border-left: 1px solid #e4e4e7;">{{ selCount }} sél.</div>
    </div>

    <!-- Candidates -->
    <div>
      <div style="font-size: 11px; font-weight: 500; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 12px;">Candidats — cliquez pour voir le détail</div>
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;">
        <div
          v-for="c in candidates"
          :key="c.id"
          class="bk-card"
          :style="{ background: 'white', border: c.border, borderRadius: '8px', padding: '16px', cursor: 'pointer', transition: 'box-shadow 0.15s', position: 'relative', display: 'flex', flexDirection: 'column' }"
          @click="bike.openCandidate(c.id)"
        >
          <!-- Vote toggle — check button, greyed when inactive (does not open the detail) -->
          <button
            :title="c.checked ? 'Vous avez voté' : 'Voter pour cette feature'"
            :aria-pressed="c.checked"
            :style="{ position: 'absolute', top: '12px', right: '12px', width: '22px', height: '22px', borderRadius: '50%', border: c.checked ? 'none' : '1px solid #e4e4e7', background: c.checked ? '#18181b' : '#f4f4f5', color: c.checked ? 'white' : '#d4d4d8', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0, transition: 'background 0.15s, color 0.15s' }"
            @click.stop="bike.toggleCandidate(c.id)"
          >
            <Check style="width: 13px; height: 13px;" :stroke-width="3" />
          </button>
          <div style="display: flex; gap: 3px; margin-bottom: 12px;">
            <div v-for="(v, i) in c.votes" :key="i" :title="v.name" :style="{ width: '22px', height: '22px', borderRadius: '50%', background: v.bg, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 700 }">{{ v.init }}</div>
          </div>
          <div style="font-size: 14px; font-weight: 600; color: #18181b; margin-bottom: 5px; line-height: 1.3; padding-right: 24px;">{{ c.title }}</div>
          <div style="font-size: 13px; color: #71717a; line-height: 1.5; margin-bottom: 12px;">{{ c.desc }}</div>
          <div style="display: flex; gap: 6px; flex-wrap: wrap;">
            <span style="font-size: 12px; padding: 2px 8px; background: #f4f4f5; color: #71717a; border-radius: 4px; font-weight: 500;">{{ c.effort }}</span>
            <span :style="{ fontSize: '12px', padding: '2px 8px', background: c.iBg, color: c.iColor, borderRadius: '4px', fontWeight: 500 }">{{ c.impact }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Why now -->
    <div style="background: white; border: 1px solid #e4e4e7; border-radius: 8px; padding: 16px 20px;">
      <div style="font-size: 11px; font-weight: 500; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 10px;">Pourquoi maintenant ?</div>
      <textarea
        placeholder="Décrivez la rationale de ce cycle..."
        style="width: 100%; min-height: 88px; padding: 10px 13px; border: 1px solid #e4e4e7; border-radius: 6px; font-family: inherit; font-size: 14px; color: #18181b; resize: none; line-height: 1.6; background: white;"
      >{{ bettingWhy }}</textarea>
    </div>

    <!-- Candidate detail — shadcn Sheet (right panel) -->
    <Sheet v-model:open="open">
      <SheetContent class="w-full sm:max-w-md p-0 gap-0">
        <template v-if="candidateDetail">
          <SheetHeader style="padding: 16px 20px; border-bottom: 1px solid #f4f4f5;">
            <SheetTitle style="font-size: 14px; font-weight: 600; color: #18181b; line-height: 1.4; padding-right: 24px;">{{ candidateDetail.title }}</SheetTitle>
            <div style="display: flex; gap: 6px; flex-wrap: wrap;">
              <span style="font-size: 12px; padding: 2px 8px; background: #f4f4f5; color: #71717a; border-radius: 4px; font-weight: 500;">{{ candidateDetail.effort }}</span>
              <span :style="{ fontSize: '12px', padding: '2px 8px', background: candidateDetail.iBg, color: candidateDetail.iColor, borderRadius: '4px', fontWeight: 500 }">{{ candidateDetail.impact }}</span>
            </div>
          </SheetHeader>

          <div style="padding: 14px 20px; border-bottom: 1px solid #f4f4f5;">
            <div style="font-size: 13px; color: #71717a; line-height: 1.65;">{{ candidateDetail.fullDesc }}</div>
          </div>

          <div style="padding: 12px 20px; border-bottom: 1px solid #f4f4f5;">
            <button
              :style="{ width: '100%', padding: '8px 14px', background: candidateDetail.voteBg, color: candidateDetail.voteColor, border: candidateDetail.voteBorder, borderRadius: '6px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center' }"
              @click="bike.toggleCandidate(candidateDetail.id)"
            >{{ candidateDetail.voteLabel }}</button>
          </div>

          <div style="padding: 16px 20px; overflow-y: auto; flex: 1;">
            <div style="font-size: 11px; font-weight: 500; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 12px;">Votes de l'équipe</div>
            <div style="display: flex; flex-direction: column; gap: 8px;">
              <div v-for="(v, i) in candidateDetail.richVotes" :key="i" style="display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; background: #fafafa; border: 1px solid #f4f4f5; border-radius: 6px;">
                <div :style="{ width: '24px', height: '24px', borderRadius: '50%', background: v.bg, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, flexShrink: 0 }">{{ v.init }}</div>
                <div style="flex: 1;">
                  <div style="font-size: 12px; font-weight: 600; color: #18181b; margin-bottom: 3px;">{{ v.user }}</div>
                  <div style="font-size: 13px; color: #71717a; line-height: 1.5;">{{ v.reason }}</div>
                </div>
              </div>
            </div>
          </div>
        </template>
      </SheetContent>
    </Sheet>
  </div>
</template>

<style scoped>
.bk-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.07); }
</style>
