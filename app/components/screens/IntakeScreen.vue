<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { ArrowDown, ArrowUp, Layers, Paperclip, Sparkles, X } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

interface Candidate { feature_id: string; title: string; similarity: number }
interface Proposal {
  action: 'create_feature' | 'append' | 'merge' | 'discard'
  target_feature_id: string | null; merge_from_feature_id?: string | null
  classification: string; confidence: number; rationale: string
  proposed_spec: { title: string; problem: string; appetite: string; solution: string; rabbit_holes: string; out_of_bounds: string }
  candidates: Candidate[]
}
interface BatchSegment { id: string; signal: { title: string; problem: string; classification: string }; proposal: Proposal; include: boolean; duplicate_of?: string | null }
interface TurnResponse { session_id: string; state: string; agent_message: string; proposal: Proposal | null; batch?: { session_id: string; segments: BatchSegment[] } }
interface Msg { role: 'user' | 'agent'; text: string; attachments?: Att[] }

const bike = useBicycle()
const { author } = bike

const sessionId = ref<string | null>(null)
const messages = ref<Msg[]>([])
const proposal = ref<Proposal | null>(null)
const state = ref('')
const draft = ref('')
const pending = ref(false)
const committed = ref<{ action: string; feature_id: string | null } | null>(null)
const chatEl = ref<HTMLElement | null>(null)

interface Att { id: string; filename: string; kind: string }
const attachments = ref<Att[]>([])
const uploading = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
async function uploadFiles(files: File[]) {
  if (!files.length) return
  uploading.value = true
  try {
    const fd = new FormData()
    for (const f of files) fd.append('files', f)
    const r = await $fetch<{ attachments: Att[] }>('/api/uploads', { method: 'POST', body: fd })
    attachments.value.push(...r.attachments)
  } finally { uploading.value = false }
}
async function onFiles(e: Event) {
  const input = e.target as HTMLInputElement
  await uploadFiles(Array.from(input.files ?? []))
  if (input) input.value = ''
}
function removeAttachment(id: string) { attachments.value = attachments.value.filter(a => a.id !== id) }

// Drag & drop attachments onto the composer — available in the empty state AND mid-intake.
const dragOver = ref(false)
function onDrop(e: DragEvent) {
  dragOver.value = false
  uploadFiles(Array.from(e.dataTransfer?.files ?? []))
}
function onDragLeave(e: DragEvent) {
  if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) dragOver.value = false
}

// ── Stick-to-bottom chat scroll ──────────────────────────────────────────────────────────────
// Auto-scroll to the newest message, but ONLY while the user is already at the bottom — never yank
// them down while they've scrolled up to read. A floating button jumps back down on demand.
const atBottom = ref(true)
function onScroll() {
  const el = chatEl.value
  if (el) atBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 80
}
function scrollToBottom(behavior: ScrollBehavior = 'auto') {
  const el = chatEl.value
  if (el) el.scrollTo({ top: el.scrollHeight, behavior })
}
watch([() => messages.value.length, proposal, committed, pending], async () => {
  const stick = atBottom.value
  await nextTick()
  if (stick) scrollToBottom()
})

async function send() {
  const text = draft.value.trim()
  if ((!text && !attachments.value.length) || pending.value) return
  pending.value = true
  const atts = attachments.value
  attachments.value = [] // clear the composer immediately; the message keeps its own copy
  messages.value.push({ role: 'user', text, attachments: atts.length ? atts : undefined })
  draft.value = ''
  nextTick(() => scrollToBottom('smooth')) // the user's own message always reveals itself
  try {
    const r = await $fetch<TurnResponse>('/api/intake/turn', {
      method: 'POST',
      body: { session_id: sessionId.value, message: text, captured_by: author.value, attachment_ids: atts.map(a => a.id) },
    })
    sessionId.value = r.session_id
    proposal.value = r.proposal
    state.value = r.state
    messages.value.push({ role: 'agent', text: r.agent_message })
    // The agent decided this input covers several problems → it auto-decomposed; show the review.
    if (r.batch) { batch.value = r.batch; reviewOpen.value = true }
  } catch (e: unknown) {
    toast.error((e as { statusMessage?: string })?.statusMessage || "L'agent n'a pas pu répondre")
    messages.value.push({ role: 'agent', text: 'Désolé, une erreur est survenue de mon côté. Réessaie.' })
  } finally { pending.value = false }
}
function pick(text: string) { draft.value = text; send() }
async function accept() {
  if (!sessionId.value || pending.value) return
  pending.value = true
  try {
    const r = await $fetch<{ action: string; feature_id: string }>('/api/intake/commit', { method: 'POST', body: { session_id: sessionId.value } })
    committed.value = { action: r.action, feature_id: r.feature_id }
    proposal.value = null
    // A commit creates/updates a feature → the backlog + counts must re-sync.
    await invalidate(qk.features, qk.featureDetail, qk.overview)
    toast.success(r.action === 'discard' ? 'Signal écarté' : r.action === 'append' ? 'Signal rattaché à la feature' : r.action === 'merge' ? 'Features fusionnées' : 'Feature créée')
  } catch (e: unknown) { toast.error((e as { statusMessage?: string })?.statusMessage || 'Écriture impossible') } finally { pending.value = false }
}
// ── Batch decomposition (agent-decided: multi-topic input → N features for review) ────────────
// `batch` holds the decomposition; `reviewOpen` controls the takeover. Closing the review keeps the
// batch so it stays re-openable from the chat (no dead end, no dangling "valide ci-dessous").
const batch = ref<{ session_id: string; segments: BatchSegment[] } | null>(null)
const reviewOpen = ref(false)
const batchRecap = ref<{ created: number; updated: number; discarded: number } | null>(null)

async function confirmBatch(selections: { id: string; action_override: string; target_override: string | null }[]) {
  if (!batch.value || pending.value) return
  pending.value = true
  try {
    const r = await $fetch<{ created: number; updated: number; discarded: number }>('/api/intake/commit-batch', { method: 'POST', body: { session_id: batch.value.session_id, segments: selections } })
    batchRecap.value = { created: r.created, updated: r.updated, discarded: r.discarded }
    batch.value = null; reviewOpen.value = false
    await invalidate(qk.features, qk.featureDetail, qk.overview)
    toast.success(`${r.created} créée(s) · ${r.updated} mise(s) à jour`)
  } catch (e: unknown) { toast.error((e as { statusMessage?: string })?.statusMessage || 'Écriture impossible') } finally { pending.value = false }
}
function cancelBatch() { reviewOpen.value = false } // back to chat; reopen anytime

function reset() {
  sessionId.value = null; messages.value = []; proposal.value = null
  state.value = ''; committed.value = null; draft.value = ''; attachments.value = []
  batch.value = null; reviewOpen.value = false; batchRecap.value = null
}
function onKey(e: KeyboardEvent) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }

const ACTION_LABEL: Record<string, string> = {
  create_feature: 'Créer une nouvelle feature', append: 'Rattacher à une feature',
  merge: 'Fusionner des features', discard: 'Écarter (doublon / hors-scope)',
}
const QUICK = [
  'Les utilisateurs se plaignent que ',
  'Où en est-on sur ',
  'Sur le ticket …, précise que ',
  'Bug critique : ',
]
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- BATCH RECAP (after committing a decomposition) -->
    <div v-if="batchRecap" class="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <div class="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Sparkles class="size-5" /></div>
      <div>
        <h1 class="text-xl font-semibold tracking-tight">Décomposition appliquée</h1>
        <p class="mt-1 text-sm text-muted-foreground">{{ batchRecap.created }} feature(s) créée(s) · {{ batchRecap.updated }} mise(s) à jour<template v-if="batchRecap.discarded"> · {{ batchRecap.discarded }} écartée(s)</template></p>
      </div>
      <Button @click="reset">Nouveau signal</Button>
    </div>

    <!-- BATCH REVIEW (takeover) -->
    <IntakeBatchReview v-else-if="batch && reviewOpen" :segments="batch.segments" :pending="pending" @confirm="confirmBatch" @cancel="cancelBatch" />

    <!-- EMPTY -->
    <div v-else-if="messages.length === 0" class="flex flex-1 items-center justify-center overflow-auto p-6">
      <div class="w-full max-w-2xl">
        <div class="mb-6 flex flex-col items-center gap-3 text-center">
          <div class="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Sparkles class="size-5" /></div>
          <div>
            <h1 class="text-xl font-semibold tracking-tight">Comment puis-je vous aider ?</h1>
            <p class="mt-1 text-sm text-muted-foreground">Décrivez un signal, posez une question, ou affinez un ticket. L'écriture n'a lieu qu'à la confirmation.</p>
          </div>
        </div>

        <Card class="py-0 transition-colors" :class="dragOver ? 'border-primary ring-2 ring-primary/30' : ''" @dragover.prevent="dragOver = true" @dragleave="onDragLeave" @drop.prevent="onDrop">
          <CardContent class="p-2">
            <Textarea v-model="draft" placeholder="Ex: l'export PDF est très lent pour les rapports >100Mo, 5 plaintes cette semaine…" class="min-h-28 resize-none border-0 shadow-none focus-visible:ring-0 dark:bg-transparent" @keydown="onKey" />
            <div v-if="attachments.length" class="flex flex-wrap gap-1.5 px-2 pb-2">
              <Badge v-for="a in attachments" :key="a.id" variant="secondary" class="gap-1">{{ a.kind === 'image' ? '🖼️' : '📄' }} {{ a.filename }}<button @click="removeAttachment(a.id)"><X class="size-3" /></button></Badge>
            </div>
            <div class="flex items-center justify-between px-1 pb-1">
              <input ref="fileInput" type="file" multiple accept="image/*,text/*,.txt,.md,.csv,.json,.log,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" class="hidden" @change="onFiles">
              <Button variant="ghost" size="sm" :disabled="uploading" @click="fileInput?.click()"><Paperclip class="size-4" /> {{ uploading ? 'Envoi…' : 'Joindre' }}</Button>
              <Button size="sm" :disabled="pending || (!draft.trim() && !attachments.length)" @click="send">Envoyer <ArrowUp class="size-4" /></Button>
            </div>
          </CardContent>
        </Card>

        <div class="mt-3 flex flex-wrap justify-center gap-2">
          <Button v-for="q in QUICK" :key="q" variant="outline" size="sm" class="text-muted-foreground" @click="draft = q">{{ q.trim() }}…</Button>
        </div>
      </div>
    </div>

    <!-- CHAT -->
    <template v-else>
      <div class="relative min-h-0 flex-1">
        <div ref="chatEl" class="h-full overflow-y-auto" @scroll="onScroll">
          <div class="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
          <div v-for="(m, i) in messages" :key="i" class="flex gap-2.5" :class="m.role === 'user' ? 'justify-end' : ''">
            <div v-if="m.role === 'agent'" class="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground"><Sparkles class="size-3.5" /></div>
            <div class="max-w-[80%] rounded-lg px-3.5 py-2.5 text-sm leading-relaxed" :class="m.role === 'agent' ? 'bg-muted' : 'bg-primary text-primary-foreground'">
              <div v-if="m.attachments?.length" class="mb-2 flex flex-wrap gap-1.5">
                <AttachmentPreview v-for="a in m.attachments" :key="a.id" :attachment="a" size="size-16" />
              </div>
              <span class="whitespace-pre-wrap">{{ m.text }}</span>
            </div>
          </div>

          <div v-if="pending" class="flex gap-2.5">
            <div class="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground"><Sparkles class="size-3.5" /></div>
            <div class="flex items-center gap-1 rounded-lg bg-muted px-3.5 py-3"><span class="bk-dot" /><span class="bk-dot" /><span class="bk-dot" /></div>
          </div>

          <!-- Routing proposal -->
          <Card v-if="proposal" class="ml-8 gap-0 overflow-hidden py-0">
            <div class="flex items-center justify-between border-b px-4 py-2.5">
              <span class="text-xs font-medium uppercase tracking-wide text-muted-foreground">{{ state === 'pending_review' ? 'Arbitrage requis' : 'Décision de routing' }}</span>
              <Badge variant="outline" class="font-mono">conf. {{ (proposal.confidence * 100) | 0 }}%</Badge>
            </div>
            <CardContent class="flex flex-col gap-3 p-4">
              <div v-if="state === 'pending_review'" class="flex flex-wrap gap-2 rounded-md border border-dashed p-2.5">
                <Button variant="outline" size="sm" :disabled="pending" @click="pick('Crée une nouvelle feature pour ça.')">+ Nouvelle feature</Button>
                <Button v-for="c in proposal.candidates" :key="c.feature_id" variant="outline" size="sm" :disabled="pending" @click="pick(`Rattache plutôt à la feature « ${c.title} ».`)">→ {{ c.title }}</Button>
              </div>

              <div class="flex items-center gap-2">
                <Badge>{{ ACTION_LABEL[proposal.action] || proposal.action }}</Badge>
                <span v-if="proposal.target_feature_id" class="font-mono text-xs text-muted-foreground">{{ proposal.target_feature_id.slice(0, 8) }}</span>
              </div>
              <p v-if="proposal.rationale" class="text-sm italic text-muted-foreground">{{ proposal.rationale }}</p>

              <Card v-if="proposal.action !== 'discard'" class="gap-1.5 py-0">
                <CardContent class="p-3">
                  <div class="font-medium">{{ proposal.proposed_spec.title }}</div>
                  <p class="mt-1 text-sm text-muted-foreground">{{ proposal.proposed_spec.problem }}</p>
                  <div v-if="proposal.proposed_spec.solution" class="mt-1.5 text-sm"><span class="font-medium">Solution :</span> {{ proposal.proposed_spec.solution }}</div>
                  <div class="mt-2 flex gap-1.5"><Badge variant="outline">appétit · {{ proposal.proposed_spec.appetite }}</Badge><Badge variant="secondary">{{ proposal.classification }}</Badge></div>
                </CardContent>
              </Card>

              <div v-if="proposal.candidates.length" class="text-sm">
                <div class="mb-1 text-xs text-muted-foreground">Doublons proches</div>
                <div v-for="c in proposal.candidates" :key="c.feature_id" class="flex justify-between text-muted-foreground"><span>{{ c.title }}</span><span class="font-mono">{{ (c.similarity * 100) | 0 }}%</span></div>
              </div>

              <Button class="w-full" :disabled="pending" @click="accept">{{ proposal.action === 'discard' ? 'Écarter (archiver)' : proposal.action === 'merge' ? 'Confirmer la fusion' : 'Confirmer & écrire' }}</Button>
            </CardContent>
          </Card>

          <!-- Committed -->
          <Card v-if="committed" class="ml-8 py-0">
            <CardContent class="flex items-center gap-3 p-3 text-sm">
              <span class="flex-1">
                <template v-if="committed.action === 'discard'">Signal écarté — archivé.</template>
                <template v-else>✓ Écrit en base — {{ committed.action === 'append' ? 'rattaché à' : committed.action === 'merge' ? 'survivante' : 'nouvelle feature' }} <code class="font-mono">{{ committed.feature_id?.slice(0, 8) }}</code></template>
              </span>
              <Button variant="outline" size="sm" @click="reset">Nouveau signal</Button>
            </CardContent>
          </Card>

          <!-- Batch recap closed → always re-openable (no dead end) -->
          <div v-if="batch && !reviewOpen" class="ml-8">
            <Button size="sm" @click="reviewOpen = true"><Layers class="size-4" /> Ouvrir l'écran de validation ({{ batch.segments.length }})</Button>
          </div>

          </div>
        </div>
        <Transition enter-active-class="transition duration-150" enter-from-class="translate-y-1 opacity-0" leave-active-class="transition duration-150" leave-to-class="translate-y-1 opacity-0">
          <Button v-if="!atBottom" size="icon" variant="secondary" class="absolute bottom-3 left-1/2 size-9 -translate-x-1/2 rounded-full border shadow-md" aria-label="Aller en bas" @click="scrollToBottom('smooth')"><ArrowDown class="size-4" /></Button>
        </Transition>
      </div>

      <div v-if="!committed" class="shrink-0 border-t p-3">
        <div class="mx-auto max-w-2xl">
          <Card class="py-0 transition-colors" :class="dragOver ? 'border-primary ring-2 ring-primary/30' : ''" @dragover.prevent="dragOver = true" @dragleave="onDragLeave" @drop.prevent="onDrop">
            <CardContent class="p-2">
              <div v-if="attachments.length" class="flex flex-wrap gap-1.5 px-1 pb-2">
                <Badge v-for="a in attachments" :key="a.id" variant="secondary" class="gap-1">{{ a.kind === 'image' ? '🖼️' : '📄' }} {{ a.filename }}<button @click="removeAttachment(a.id)"><X class="size-3" /></button></Badge>
              </div>
              <div class="flex items-end gap-1.5">
                <input ref="fileInput" type="file" multiple accept="image/*,text/*,.txt,.md,.csv,.json,.log,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" class="hidden" @change="onFiles">
                <Button variant="ghost" size="icon" class="size-9 shrink-0 text-muted-foreground" :disabled="uploading" :title="uploading ? 'Envoi…' : 'Joindre un fichier'" @click="fileInput?.click()"><Paperclip class="size-4" /></Button>
                <Textarea v-model="draft" :placeholder="dragOver ? 'Déposez vos fichiers ici…' : 'Réponds, précise ou corrige le routing…'" rows="1" class="min-h-9 resize-none border-0 shadow-none focus-visible:ring-0 dark:bg-transparent" @keydown="onKey" />
                <Button size="icon" :disabled="pending || (!draft.trim() && !attachments.length)" @click="send"><ArrowUp class="size-4" /></Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.bk-dot { width: 6px; height: 6px; border-radius: 9999px; background: currentColor; opacity: 0.4; display: inline-block; animation: bk-bounce 1.2s infinite ease-in-out; }
.bk-dot:nth-child(2) { animation-delay: 0.15s; }
.bk-dot:nth-child(3) { animation-delay: 0.3s; }
@keyframes bk-bounce { 0%, 60%, 100% { transform: translateY(0); opacity: 0.3; } 30% { transform: translateY(-4px); opacity: 0.9; } }
</style>
