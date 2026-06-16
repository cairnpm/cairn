<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

interface Candidate { feature_id: string; title: string; similarity: number }
interface Proposal {
  action: 'create_feature' | 'append' | 'merge' | 'discard'
  target_feature_id: string | null
  merge_from_feature_id?: string | null
  classification: string
  confidence: number
  rationale: string
  proposed_spec: { title: string; problem: string; appetite: string; solution: string; rabbit_holes: string; out_of_bounds: string }
  candidates: Candidate[]
}
interface TurnResponse { session_id: string; state: string; agent_message: string; proposal: Proposal | null }
interface Msg { role: 'user' | 'agent'; text: string }

const bike = useBicycle()
const { author } = bike

const sessionId = ref<string | null>(null)
const messages = ref<Msg[]>([])
const proposal = ref<Proposal | null>(null)
const state = ref<string>('')
const draft = ref('')
const pending = ref(false)
const committed = ref<{ action: string; feature_id: string | null } | null>(null)
const chatEl = ref<HTMLElement | null>(null)

function scrollDown() {
  // Double rAF: let the (possibly long) proposal card lay out before scrolling to it.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (chatEl.value) chatEl.value.scrollTop = chatEl.value.scrollHeight
  }))
}
watch([() => messages.value.length, proposal, committed], async () => {
  await nextTick()
  scrollDown()
})

async function send() {
  const text = draft.value.trim()
  if (!text || pending.value) return
  pending.value = true
  messages.value.push({ role: 'user', text })
  draft.value = ''
  try {
    const r = await $fetch<TurnResponse>('/api/intake/turn', {
      method: 'POST',
      body: { session_id: sessionId.value, message: text, captured_by: author.value },
    })
    sessionId.value = r.session_id
    proposal.value = r.proposal
    state.value = r.state
    messages.value.push({ role: 'agent', text: r.agent_message })
  } finally {
    pending.value = false
  }
}

// Arbitration helper (pending_review): send a templated correction turn.
function pick(text: string) {
  draft.value = text
  send()
}

async function accept() {
  if (!sessionId.value || pending.value) return
  pending.value = true
  try {
    const r = await $fetch<{ action: string; feature_id: string; idempotent: boolean }>('/api/intake/commit', {
      method: 'POST',
      body: { session_id: sessionId.value },
    })
    committed.value = { action: r.action, feature_id: r.feature_id }
    proposal.value = null
  } finally {
    pending.value = false
  }
}

function reset() {
  sessionId.value = null
  messages.value = []
  proposal.value = null
  state.value = ''
  committed.value = null
  draft.value = ''
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
}

const suggestions = [
  'Les utilisateurs se plaignent que l\'export PDF est très lent (~30s)',
  'Où en est la feature Slack notifications ?',
  'Sur le ticket Slack notifications, précise qu\'il faut aussi notifier les nouveaux commentaires',
  'Bug critique : crash de l\'app sur export en batch avec +50 fichiers',
]
const chips = ['📝 Signal : export PDF lent', '🔎 Où en est Slack ?', '✏️ Affiner Slack notifications', '🐛 Bug critique prod']

const ACTION_LABEL: Record<string, string> = {
  create_feature: 'Créer une nouvelle feature',
  append: 'Rattacher à une feature existante',
  merge: 'Fusionner des features',
  discard: 'Écarter (doublon / hors-scope)',
}
</script>

<template>
  <div style="height: 100%; display: flex; flex-direction: column; background: white;">
    <!-- Empty / welcome -->
    <div v-if="messages.length === 0" style="flex: 1; display: flex; align-items: center; justify-content: center; padding: 40px 32px;">
      <div style="width: 100%; max-width: 600px; display: flex; flex-direction: column; align-items: center; gap: 32px;">
        <div style="display: flex; flex-direction: column; align-items: center; gap: 16px;">
          <div style="width: 56px; height: 56px; background: #18181b; border-radius: 14px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 16px rgba(0,0,0,0.15);">
            <span style="color: white; font-size: 26px; font-weight: 800; letter-spacing: -1px;">B</span>
          </div>
          <div style="text-align: center;">
            <div style="font-size: 26px; font-weight: 700; color: #18181b; margin-bottom: 10px; letter-spacing: -0.5px;">Comment puis-je vous aider ?</div>
            <div style="font-size: 15px; color: #71717a; line-height: 1.65; max-width: 480px;">Décrivez un signal, posez une question (« où en est… ? ») ou affinez un ticket (« sur…, précise… »).<br>Je détecte les doublons ; l'écriture n'a lieu qu'à la confirmation.</div>
          </div>
        </div>

        <div style="width: 100%; border: 1.5px solid #e4e4e7; border-radius: 14px; background: white; overflow: hidden; box-shadow: 0 2px 16px rgba(0,0,0,0.06);">
          <textarea
            v-model="draft"
            placeholder="Ex: les utilisateurs se plaignent que l'export PDF est très lent..."
            style="width: 100%; min-height: 108px; padding: 18px 18px 10px; border: none; font-family: inherit; font-size: 15px; color: #18181b; resize: none; line-height: 1.65; background: transparent;"
            @keydown="onKey"
          />
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; border-top: 1px solid #f4f4f5; background: #fafafa;">
            <span style="font-size: 12px; color: #a1a1aa;">Shift+Entrée pour une nouvelle ligne</span>
            <button class="bk-dark" :disabled="pending || !draft.trim()" style="padding: 8px 20px; background: #18181b; color: white; border: none; border-radius: 7px; font-size: 14px; font-weight: 500; cursor: pointer; font-family: inherit;" @click="send">Envoyer ↑</button>
          </div>
        </div>

        <div style="display: flex; gap: 8px; flex-wrap: wrap; justify-content: center;">
          <button v-for="(chip, i) in chips" :key="chip" class="bk-chip" style="padding: 7px 16px; border: 1px solid #e4e4e7; background: white; color: #71717a; border-radius: 99px; font-size: 13px; cursor: pointer; font-family: inherit;" @click="draft = suggestions[i]">{{ chip }}</button>
        </div>
      </div>
    </div>

    <!-- Chat -->
    <template v-else>
      <div ref="chatEl" style="flex: 1; min-height: 0; overflow-y: auto; padding: 32px; display: flex; flex-direction: column; gap: 20px;">
        <div v-for="(m, i) in messages" :key="i" :style="{ display: 'flex', gap: '10px', justifyContent: m.role === 'agent' ? 'flex-start' : 'flex-end', alignItems: 'flex-end', maxWidth: '720px', width: '100%', margin: '0 auto', boxSizing: 'border-box' }">
          <div v-if="m.role === 'agent'" style="width: 28px; height: 28px; background: #18181b; border-radius: 7px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
            <span style="color: white; font-size: 11px; font-weight: 700;">B</span>
          </div>
          <div :style="{ maxWidth: '72%', padding: '12px 16px', fontSize: '14px', lineHeight: '1.65', background: m.role === 'agent' ? '#f4f4f5' : '#18181b', color: m.role === 'agent' ? '#18181b' : '#fff', borderRadius: m.role === 'agent' ? '4px 14px 14px 14px' : '14px 4px 14px 14px', whiteSpace: 'pre-wrap' }">{{ m.text }}</div>
        </div>

        <!-- Proposal card — in the conversation flow -->
        <div v-if="proposal" :style="{ flexShrink: 0, maxWidth: '720px', width: '100%', margin: '0 auto', border: `1.5px solid ${state === 'pending_review' ? '#f59e0b' : '#18181b'}`, borderRadius: '12px', overflow: 'hidden' }">
          <div :style="{ padding: '12px 16px', background: state === 'pending_review' ? '#b45309' : '#18181b', color: 'white', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600 }">
            <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.8;">{{ state === 'pending_review' ? '⚠ Arbitrage requis' : 'Décision de routing' }}</span>
            <span style="margin-left: auto; font-size: 12px; padding: 2px 8px; border-radius: 99px; background: rgba(255,255,255,0.15);">{{ (proposal.confidence * 100) | 0 }}%</span>
          </div>
          <div style="padding: 16px;">
            <!-- Low-confidence arbitration: explicit human choice -->
            <div v-if="state === 'pending_review'" style="margin-bottom: 12px; padding: 10px 12px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px;">
              <div style="font-size: 12px; color: #92400e; margin-bottom: 8px;">Confiance faible — choisis le routing :</div>
              <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                <button class="bk-choice" :disabled="pending" style="padding: 6px 12px; border: 1px solid #e4e4e7; background: white; color: #18181b; border-radius: 6px; font-size: 12px; font-weight: 500; cursor: pointer; font-family: inherit;" @click="pick('Crée une nouvelle feature pour ça.')">+ Créer une nouvelle feature</button>
                <button v-for="c in proposal.candidates" :key="c.feature_id" class="bk-choice" :disabled="pending" style="padding: 6px 12px; border: 1px solid #e4e4e7; background: white; color: #18181b; border-radius: 6px; font-size: 12px; font-weight: 500; cursor: pointer; font-family: inherit;" @click="pick(`Rattache plutôt à la feature « ${c.title} ».`)">→ Rattacher à « {{ c.title }} »</button>
              </div>
            </div>

            <!-- The decision: create / append / merge / discard -->
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px; padding: 8px 12px; background: #f4f4f5; border-radius: 8px;">
              <span style="font-size: 13px; font-weight: 600; color: #18181b;">{{ ACTION_LABEL[proposal.action] || proposal.action }}</span>
              <span v-if="proposal.target_feature_id" style="font-size: 11px; color: #71717a; font-family: 'Courier New', monospace;">→ {{ proposal.target_feature_id.slice(0, 8) }}</span>
              <span v-if="proposal.merge_from_feature_id" style="font-size: 11px; color: #71717a; font-family: 'Courier New', monospace;">⊕ absorbe {{ proposal.merge_from_feature_id.slice(0, 8) }}</span>
            </div>
            <div v-if="proposal.rationale" style="font-size: 12px; color: #71717a; font-style: italic; line-height: 1.5; margin-bottom: 12px;">{{ proposal.rationale }}</div>

            <template v-if="proposal.action !== 'discard'">
              <div style="font-size: 15px; font-weight: 600; color: #18181b; margin-bottom: 4px;">{{ proposal.proposed_spec.title }}</div>
              <div style="font-size: 13px; color: #71717a; line-height: 1.55; margin-bottom: 8px;">{{ proposal.proposed_spec.problem }}</div>
              <div v-if="proposal.proposed_spec.solution" style="font-size: 12px; color: #71717a; line-height: 1.5; margin-bottom: 6px;">
                <strong style="color: #18181b;">Solution :</strong> {{ proposal.proposed_spec.solution }}
              </div>
              <div v-if="proposal.proposed_spec.rabbit_holes" style="font-size: 12px; color: #71717a; line-height: 1.5; margin-bottom: 6px;">
                <strong style="color: #18181b;">Rabbit holes :</strong> {{ proposal.proposed_spec.rabbit_holes }}
              </div>
              <div v-if="proposal.proposed_spec.out_of_bounds" style="font-size: 12px; color: #a1a1aa; line-height: 1.5; margin-bottom: 10px;">
                <strong style="color: #71717a;">No-gos :</strong> {{ proposal.proposed_spec.out_of_bounds }}
              </div>
              <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px;">
                <span style="font-size: 12px; padding: 2px 8px; background: #f4f4f5; color: #71717a; border-radius: 4px; font-weight: 500;">appétit · {{ proposal.proposed_spec.appetite }}</span>
                <span style="font-size: 12px; padding: 2px 8px; background: #f4f4f5; color: #71717a; border-radius: 4px; font-weight: 500;">{{ proposal.classification }}</span>
              </div>
            </template>
            <div v-if="proposal.candidates.length" style="font-size: 12px; color: #a1a1aa; margin-bottom: 6px;">Doublons proches détectés :</div>
            <div v-for="c in proposal.candidates" :key="c.feature_id" style="font-size: 12px; color: #71717a; display: flex; justify-content: space-between; padding: 3px 0;">
              <span>{{ c.title }}</span><span style="font-family: 'Courier New', monospace;">{{ (c.similarity * 100) | 0 }}%</span>
            </div>
            <div style="display: flex; gap: 8px; margin-top: 14px;">
              <button class="bk-dark" :disabled="pending" style="flex: 1; padding: 9px; background: #18181b; color: white; border: none; border-radius: 7px; font-size: 14px; font-weight: 500; cursor: pointer; font-family: inherit;" @click="accept">{{ proposal.action === 'discard' ? '✓ Écarter (archiver)' : proposal.action === 'merge' ? '✓ Confirmer la fusion' : '✓ Confirmer & écrire' }}</button>
              <span style="flex: 1; display: flex; align-items: center; justify-content: center; font-size: 12px; color: #a1a1aa; text-align: center;">…ou corrige ci-dessous</span>
            </div>
          </div>
        </div>

        <!-- Committed banner — in flow -->
        <div v-if="committed" style="flex-shrink: 0; max-width: 720px; width: 100%; margin: 0 auto; border: 1px solid #bbf7d0; background: #f0fdf4; border-radius: 10px; padding: 14px 16px; display: flex; align-items: center; gap: 12px;">
          <span style="font-size: 18px;">✓</span>
          <div style="flex: 1; font-size: 13px; color: #15803d;">
            <template v-if="committed.action === 'discard'">Signal écarté — archivé, aucune feature créée.</template>
            <template v-else-if="committed.action === 'merge'">Features fusionnées — survivante <code>{{ committed.feature_id?.slice(0, 8) }}</code>.</template>
            <template v-else>Écrit en base — {{ committed.action === 'append' ? 'rattaché à' : 'nouvelle feature' }} <code>{{ committed.feature_id?.slice(0, 8) }}</code>.</template>
          </div>
          <button style="padding: 6px 12px; background: white; border: 1px solid #bbf7d0; color: #15803d; border-radius: 6px; font-size: 13px; cursor: pointer; font-family: inherit;" @click="reset">Nouveau signal</button>
        </div>
      </div>

      <div v-if="!committed" style="border-top: 1px solid #e4e4e7; padding: 16px 32px; background: white; flex-shrink: 0;">
        <div style="max-width: 720px; margin: 0 auto; display: flex; gap: 8px;">
          <input v-model="draft" type="text" placeholder="Réponds, précise ou corrige le routing..." style="flex: 1; padding: 11px 16px; border: 1.5px solid #e4e4e7; border-radius: 8px; font-size: 14px; font-family: inherit; color: #18181b; background: white;" @keydown="onKey">
          <button class="bk-dark" :disabled="pending || !draft.trim()" style="width: 44px; height: 44px; background: #18181b; color: white; border: none; border-radius: 8px; font-size: 20px; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0;" @click="send">↑</button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.bk-dark:hover { background: #27272a !important; }
.bk-dark:disabled { opacity: 0.5; cursor: not-allowed; }
.bk-chip:hover { border-color: #18181b !important; color: #18181b !important; }
.bk-choice:hover { border-color: #b45309 !important; background: #fffbeb !important; }
.bk-choice:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
