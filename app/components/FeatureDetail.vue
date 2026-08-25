<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { CheckCircle2, ChevronDown, CircleSlash, ExternalLink, PanelRightClose, Pencil, Play, Undo2 } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { FeatureDetailData } from '~/types/feature'

// `compact` = rendered inside the quick-view overlay (reserves header room for its corner buttons). The
// edit chat is an inline right column that pushes the detail left — not a floating drawer — so both read
// side by side. From the overlay we don't stack a chat on a cramped quick-view: the Éditer button instead
// opens the full feature page (with ?edit=1 to auto-open the chat there).
const props = defineProps<{ detail: FeatureDetailData; compact?: boolean }>()
const { t } = useUiLang()
const route = useRoute()
const chatOpen = ref(!props.compact && route.query.edit === '1')

// Manually-assigned team (member-driven, never the intake agent). Local copy synced with the server.
const { members } = useMembers()
type Assignee = FeatureDetailData['assignees'][number]
const assignees = ref<Assignee[]>([...(props.detail.assignees ?? [])])
watch(() => props.detail.assignees, v => { assignees.value = [...(v ?? [])] })
const shapers = computed(() => assignees.value.filter(a => a.role === 'shaper'))
const builders = computed(() => assignees.value.filter(a => a.role === 'builder'))

// The activity timeline must react to assignment changes — keep a local copy updated from the
// mutation response (the server returns the fresh events alongside the assignees).
type FeatureEvent = FeatureDetailData['events'][number]
const events = ref<FeatureEvent[]>([...(props.detail.events ?? [])])
watch(() => props.detail.events, v => { events.value = [...(v ?? [])] })

async function assign(method: 'POST' | 'DELETE', role: 'shaper' | 'builder', userId: string) {
  // Optimistic: apply the server's fresh response locally, then invalidate the sibling views
  // (backlog Shapers column, hill Builders column, feature page) so they re-sync too.
  try {
    const res = await $fetch<{ assignees: Assignee[], events: FeatureEvent[] }>(`/api/features/${props.detail.feature.id}/assignees`, { method, body: { user_id: userId, role } })
    assignees.value = res.assignees
    events.value = res.events
    await invalidate(qk.features, qk.featureDetail, qk.hillDetail)
    toast.success(method === 'POST' ? t('feature.assigned', { role: role === 'shaper' ? 'Shaper' : 'Builder' }) : t('feature.unassigned'))
  }
  catch (e: unknown) { toast.error((e as { statusMessage?: string })?.statusMessage || t('feature.actionFailed')) }
}

// GitHub issue: the bet materialised as an execution ticket. Owner/assignee-only server-side; the
// button only shows when a GitHub repo is linked, the feature is bet, and no issue is open yet.
type IssueLink = FeatureDetailData['issue_links'][number]
const issueLinks = ref<IssueLink[]>([...(props.detail.issue_links ?? [])])
watch(() => props.detail.issue_links, v => { issueLinks.value = [...(v ?? [])] })
const canOpenIssue = computed(() =>
  props.detail.github_ready
  && ['bet', 'building'].includes(props.detail.feature.status)
  && !issueLinks.value.some(i => i.status === 'open'))

// The header only carries an issue while it's OPEN — once closed it belongs to the history below.
const liveIssue = computed(() => issueLinks.value.find(i => i.status === 'open'))

const openingIssue = ref(false)
async function openIssue() {
  if (openingIssue.value) return
  openingIssue.value = true
  try {
    const res = await $fetch<{ issue: IssueLink | null, events: FeatureEvent[] }>(`/api/features/${props.detail.feature.id}/issue`, { method: 'POST' })
    if (res.issue) issueLinks.value = [res.issue, ...issueLinks.value]
    events.value = res.events
    await invalidate(qk.featureDetail, qk.features)
    toast.success(t('feature.issueOpened'))
  }
  catch (e: unknown) { toast.error((e as { statusMessage?: string })?.statusMessage || t('feature.actionFailed')) }
  finally { openingIssue.value = false }
}

// Execution progress: bet ⇄ building → done. Owner/assignee-only server-side (mirrored here only to
// hide the controls). Shipping is confirmed — it's the one step this product refuses to walk back.
const NEXT: Record<string, 'building' | 'done'> = { bet: 'building', building: 'done' }
const nextStatus = computed(() => NEXT[props.detail.feature.status] ?? null)
const canStepBack = computed(() => props.detail.feature.status === 'building')
const inCycle = computed(() => ['bet', 'building'].includes(props.detail.feature.status))
const { role } = useCairn()
// Anything that isn't "move forward": pause, or pull the bet out of the cycle.
const secondaryActions = computed(() => canStepBack.value || (inCycle.value && role.value === 'owner'))
const moving = ref(false)
const confirmDoneOpen = ref(false)
const dropOpen = ref(false)

async function move(direction: 'forward' | 'back' = 'forward') {
  if (moving.value) return
  moving.value = true
  try {
    const res = await $fetch<{ status: string, events: FeatureEvent[] }>(`/api/features/${props.detail.feature.id}/status`, {
      method: 'POST', body: { from: props.detail.feature.status, direction },
    })
    events.value = res.events
    confirmDoneOpen.value = false
    await invalidate(qk.featureDetail, qk.features, qk.hills, qk.hillDetail)
    toast.success(t('feature.statusAdvanced', { status: t(`common.status.${res.status}`) }))
  }
  catch (e: unknown) { toast.error((e as { statusMessage?: string })?.statusMessage || t('feature.actionFailed')) }
  finally { moving.value = false }
}

// Circuit breaker: the bet is off, the feature returns to the pool and must be re-defended.
async function drop(rationale: string) {
  if (moving.value) return
  moving.value = true
  try {
    const res = await $fetch<{ events: FeatureEvent[] }>(`/api/features/${props.detail.feature.id}/drop`, {
      method: 'POST', body: { rationale },
    })
    events.value = res.events
    dropOpen.value = false
    await invalidate(qk.featureDetail, qk.features, qk.hills, qk.hillDetail)
    toast.success(t('feature.drop.done'))
  }
  catch (e: unknown) { toast.error((e as { statusMessage?: string })?.statusMessage || t('feature.actionFailed')) }
  finally { moving.value = false }
}

const PITCH = ['problem', 'solution', 'rabbit_holes', 'out_of_bounds'] as const
</script>

<template>
  <div class="flex h-full min-h-0">
    <div class="min-w-0 flex-1">
  <DetailLayout :aside-width="360" :compact="compact">
    <template #title>
      <h2 class="pr-8 text-base font-semibold leading-snug">{{ detail.feature.title }}</h2>
    </template>
    <template #header-action><slot name="header-action" /></template>
    <template #meta>
      <MetaField :label="t('feature.meta.status')"><StatusBadge :status="detail.feature.status" /></MetaField>
      <MetaField :label="t('feature.meta.appetite')"><Badge variant="outline">{{ detail.feature.appetite || '—' }}</Badge></MetaField>
      <!-- Same shape as the hill link in BettingTableDetail: the cycle is reachable from anything
           that belongs to it, in one click, without going back through the Hills list. -->
      <MetaField v-if="detail.feature.hill_id" label="Hill">
        <NuxtLink :to="`/hills/${detail.feature.hill_id}`" class="inline-flex items-center gap-1 hover:underline">
          {{ detail.feature.hill_name || t('betting.cycle') }}
          <ExternalLink class="size-3.5 opacity-60" />
        </NuxtLink>
      </MetaField>
      <MetaField v-if="liveIssue" label="GitHub">
        <GithubRefBadge :url="liveIssue.issue_url" :repo="liveIssue.repo" :number="liveIssue.issue_number" :status="liveIssue.status" compact />
      </MetaField>
      <!-- Édition: aligned bottom-right with the meta badges, clear of the overlay's top corner icons.
           Overlay → open the full page (?edit=1); full page → toggle the inline chat panel. -->
      <div class="ml-auto flex items-center gap-2 self-end">
        <Button v-if="compact" as-child variant="outline" size="sm">
          <NuxtLink :to="`/features/${detail.feature.id}?edit=1`"><Pencil class="size-4" /> {{ t('intake.refine') }}</NuxtLink>
        </Button>
        <Button v-else-if="!chatOpen" variant="outline" size="sm" @click="chatOpen = true">
          <Pencil class="size-4" /> {{ t('intake.refine') }}
        </Button>
        <!-- Split button: the step forward is the primary action, the ways to NOT go forward (pause,
             leave the cycle) live under the chevron so they can't be hit by accident. -->
        <div v-if="nextStatus" class="flex items-center">
          <Button
            size="sm" :class="secondaryActions ? 'rounded-r-none' : ''" :disabled="moving"
            @click="nextStatus === 'done' ? (confirmDoneOpen = true) : move()"
          >
            <component :is="nextStatus === 'done' ? CheckCircle2 : Play" class="size-4" />
            {{ nextStatus === 'done' ? t('feature.markDone') : t('feature.startBuilding') }}
          </Button>
          <DropdownMenu v-if="secondaryActions">
            <DropdownMenuTrigger as-child>
              <Button size="sm" class="rounded-l-none border-l border-background/25 px-2" :disabled="moving">
                <ChevronDown class="size-4" /><span class="sr-only">{{ t('feature.moreActions') }}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem v-if="canStepBack" @click="move('back')">
                <Undo2 /> {{ t('feature.stopBuilding') }}
              </DropdownMenuItem>
              <DropdownMenuItem v-if="inCycle && role === 'owner'" variant="destructive" @click="dropOpen = true">
                <CircleSlash /> {{ t('feature.drop.action') }}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </template>

    <div class="flex flex-col gap-6 p-6 text-sm">
          <!-- Équipe: shapers affinent le pitch (pré-bet), builders construisent (post-bet) -->
          <div class="grid gap-4 sm:grid-cols-2">
            <AssigneeField label="Shapers" :assignees="shapers" :members="members" @add="assign('POST', 'shaper', $event)" @remove="assign('DELETE', 'shaper', $event)" />
            <AssigneeField label="Builders" :assignees="builders" :members="members" @add="assign('POST', 'builder', $event)" @remove="assign('DELETE', 'builder', $event)" />
          </div>
          <div v-for="p in PITCH" :key="p" v-show="detail.feature[p]">
            <SectionLabel class="mb-1">{{ t('feature.pitch.' + p) }}</SectionLabel>
            <p class="leading-relaxed">{{ detail.feature[p] }}</p>
          </div>
          <!-- Why a `shaping` feature isn't shaped yet: the unresolved questions/decisions blocking it. -->
          <div v-if="detail.feature.open_questions?.length">
            <SectionLabel class="mb-1">{{ t('feature.openQuestions') }}</SectionLabel>
            <ul class="list-disc space-y-1 pl-5 leading-relaxed">
              <li v-for="(q, i) in detail.feature.open_questions" :key="i">{{ q }}</li>
            </ul>
          </div>
          <div v-if="detail.attachments.length">
            <SectionLabel class="mb-2">{{ t('feature.attachments') }}</SectionLabel>
            <div class="flex flex-wrap gap-2">
              <AttachmentPreview v-for="a in detail.attachments" :key="a.id" :attachment="a" size="size-16" />
            </div>
          </div>
          <div v-if="detail.feedback.length">
            <SectionLabel class="mb-2">{{ t('feature.signals') }} ({{ detail.feedback.length }})</SectionLabel>
            <div class="flex flex-col gap-2">
              <div v-for="fb in detail.feedback" :key="fb.id" class="rounded-md border bg-muted/40 p-3">
                <div class="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <UserAvatar :name="fb.captured_by" class="size-5" />
                  <span class="font-medium text-foreground">{{ fb.captured_by || t('feature.unknown') }}</span>
                  <Badge variant="outline" class="font-normal capitalize">{{ fb.classification }}</Badge>
                  <TimeAgo :date="fb.created_at" class="ml-auto" />
                </div>
                <div class="font-medium">{{ fb.content }}</div>
                <div v-if="fb.attachments.length" class="mt-2 flex flex-wrap gap-2">
                  <AttachmentPreview v-for="a in fb.attachments" :key="a.id" :attachment="a" />
                </div>
              </div>
            </div>
          </div>
          <div v-if="detail.decisions.length">
            <SectionLabel class="mb-2">{{ t('feature.decisions') }}</SectionLabel>
            <div v-for="d in detail.decisions" :key="d.id" class="mb-2 rounded-md border bg-muted/40 p-3">
              <div class="mb-1 flex items-center gap-2"><Badge variant="secondary" class="capitalize">{{ d.verdict }}</Badge><TimeAgo :date="d.decided_at" class="text-xs text-muted-foreground" /></div>
              <p>{{ d.rationale }}</p>
              <div class="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground"><UserAvatar :name="d.decided_by" class="size-4" />{{ d.decided_by }}</div>
            </div>
          </div>
          <div v-if="detail.pr_links.length">
            <SectionLabel class="mb-2">{{ t('feature.prGithub') }}</SectionLabel>
            <div class="flex flex-wrap gap-1.5">
              <GithubRefBadge
                v-for="p in detail.pr_links" :key="p.id"
                :url="p.pr_url" :repo="p.repo" :number="p.pr_number" :status="p.status"
              />
            </div>
          </div>
          <div v-if="issueLinks.length || canOpenIssue">
            <SectionLabel class="mb-2">{{ t('feature.issueGithub') }}</SectionLabel>
            <div class="flex flex-wrap gap-1.5">
              <GithubRefBadge
                v-for="i in issueLinks" :key="i.id"
                :url="i.issue_url" :repo="i.repo" :number="i.issue_number" :status="i.status"
              />
            </div>
            <Button v-if="canOpenIssue" variant="outline" size="sm" class="mt-2" :disabled="openingIssue" @click="openIssue">
              {{ openingIssue ? '…' : t('feature.openIssue') }}
            </Button>
          </div>
    </div>

    <template #aside>
      <ActivityTimeline :events="events" :title="t('feature.activity')" :empty-text="t('feature.noActivity')" scope="feature" />
    </template>
  </DetailLayout>
    </div>

    <!-- Edit chat: a real right column that pushes the detail left (not a floating drawer), so the
         feature and the conversation read side by side. Commits invalidate qk.featureDetail → the page
         re-syncs; the overlay re-fetches on next open. -->
    <div v-if="chatOpen" class="flex w-full max-w-[440px] shrink-0 flex-col border-l bg-background">
      <div class="flex h-14 shrink-0 items-center justify-between border-b px-4">
        <span class="text-sm font-medium">{{ t('intake.refine') }}</span>
        <Button variant="ghost" size="icon" class="size-8" :aria-label="t('common.close')" @click="chatOpen = false"><PanelRightClose class="size-4" /></Button>
      </div>
      <div class="min-h-0 flex-1">
        <IntakeScreen :key="detail.feature.id" :target-feature-id="detail.feature.id" :target-title="detail.feature.title" />
      </div>
    </div>

    <ConfirmDialog
      v-model:open="confirmDoneOpen" :busy="moving"
      :title="t('feature.doneTitle')" :description="t('feature.doneDesc', { title: detail.feature.title })"
      :cancel-label="t('backlog.cancel')" :confirm-label="t('feature.doneConfirm')"
      @confirm="move('forward')"
    />

    <DropFromCycleDialog v-model:open="dropOpen" :title="detail.feature.title" :busy="moving" @confirm="drop" />
  </div>
</template>
