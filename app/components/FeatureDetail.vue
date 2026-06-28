<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ExternalLink } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { timeAgo } from '~/utils/time'
import type { FeatureDetailData } from '~/types/feature'

const props = defineProps<{ detail: FeatureDetailData }>()

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
  const res = await $fetch<{ assignees: Assignee[], events: FeatureEvent[] }>(`/api/features/${props.detail.feature.id}/assignees`, { method, body: { user_id: userId, role } })
  assignees.value = res.assignees
  events.value = res.events
  await invalidate(qk.features, qk.featureDetail, qk.hillDetail)
}

const PITCH = [
  { key: 'problem', label: 'Problème' },
  { key: 'solution', label: 'Solution esquissée' },
  { key: 'rabbit_holes', label: 'Rabbit holes' },
  { key: 'out_of_bounds', label: 'No-gos' },
] as const
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- Header -->
    <header class="flex flex-col gap-2 border-b px-6 py-4">
      <div class="flex items-start justify-between gap-3">
        <h2 class="pr-8 text-base font-semibold leading-snug">{{ detail.feature.title }}</h2>
        <slot name="header-action" />
      </div>
      <div class="flex flex-wrap items-center gap-x-6 gap-y-2">
        <MetaField label="Statut"><StatusBadge :status="detail.feature.status" /></MetaField>
        <MetaField label="Appétit"><Badge variant="outline">{{ detail.feature.appetite || '—' }}</Badge></MetaField>
        <MetaField v-if="detail.feature.hill_name" label="Hill"><Badge variant="secondary">{{ detail.feature.hill_name }}</Badge></MetaField>
      </div>
    </header>

    <!-- Two columns -->
    <div class="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[1fr_360px]">
      <ScrollArea class="min-h-0">
        <div class="flex flex-col gap-6 p-6 text-sm">
          <!-- Équipe: shapers affinent le pitch (pré-bet), builders construisent (post-bet) -->
          <div class="grid gap-4 sm:grid-cols-2">
            <AssigneeField label="Shapers" :assignees="shapers" :members="members" @add="assign('POST', 'shaper', $event)" @remove="assign('DELETE', 'shaper', $event)" />
            <AssigneeField label="Builders" :assignees="builders" :members="members" @add="assign('POST', 'builder', $event)" @remove="assign('DELETE', 'builder', $event)" />
          </div>
          <div v-for="p in PITCH" :key="p.key" v-show="detail.feature[p.key]">
            <div class="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{{ p.label }}</div>
            <p class="leading-relaxed">{{ detail.feature[p.key] }}</p>
          </div>
          <div v-if="detail.attachments.length">
            <div class="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Pièces jointes</div>
            <div class="flex flex-wrap gap-2">
              <AttachmentPreview v-for="a in detail.attachments" :key="a.id" :attachment="a" size="size-16" />
            </div>
          </div>
          <div v-if="detail.feedback.length">
            <div class="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Signaux ({{ detail.feedback.length }})</div>
            <div class="flex flex-col gap-2">
              <div v-for="fb in detail.feedback" :key="fb.id" class="rounded-md border bg-muted/40 p-3">
                <div class="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <UserAvatar :name="fb.captured_by" class="size-5" />
                  <span class="font-medium text-foreground">{{ fb.captured_by || 'Inconnu' }}</span>
                  <Badge variant="outline" class="font-normal capitalize">{{ fb.classification }}</Badge>
                  <span class="ml-auto">{{ timeAgo(fb.created_at) }}</span>
                </div>
                <div class="font-medium">{{ fb.content }}</div>
                <div v-if="fb.attachments.length" class="mt-2 flex flex-wrap gap-2">
                  <AttachmentPreview v-for="a in fb.attachments" :key="a.id" :attachment="a" />
                </div>
              </div>
            </div>
          </div>
          <div v-if="detail.decisions.length">
            <div class="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Décisions</div>
            <div v-for="d in detail.decisions" :key="d.id" class="mb-2 rounded-md border bg-muted/40 p-3">
              <div class="mb-1 flex items-center gap-2"><Badge variant="secondary" class="capitalize">{{ d.verdict }}</Badge><span class="text-xs text-muted-foreground">{{ timeAgo(d.decided_at) }}</span></div>
              <p>{{ d.rationale }}</p>
              <div class="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground"><UserAvatar :name="d.decided_by" class="size-4" />{{ d.decided_by }}</div>
            </div>
          </div>
          <div v-if="detail.pr_links.length">
            <div class="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">PR GitHub</div>
            <a v-for="p in detail.pr_links" :key="p.id" :href="p.pr_url" target="_blank" class="flex items-center gap-1.5 font-mono text-xs text-muted-foreground hover:text-foreground">
              <ExternalLink class="size-3" />{{ p.repo }}#{{ p.pr_number }} · {{ p.status }}
            </a>
          </div>
        </div>
      </ScrollArea>

      <aside class="min-h-0 border-t bg-muted/20 md:border-l md:border-t-0">
        <ScrollArea class="h-full">
          <div class="p-6">
            <div class="mb-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">Activité ({{ events.length }})</div>
            <div class="relative flex flex-col gap-4">
              <div v-for="(e, i) in events" :key="e.seq" class="flex gap-2.5">
                <div class="relative flex flex-col items-center">
                  <UserAvatar :name="e.actor" class="size-6 shrink-0" />
                  <div v-if="i < events.length - 1" class="mt-1 w-px flex-1 bg-border" />
                </div>
                <div class="min-w-0 pb-1 text-sm">
                  <div class="leading-snug">{{ e.summary }}</div>
                  <div class="mt-0.5 text-xs text-muted-foreground">{{ timeAgo(e.created_at) }}</div>
                </div>
              </div>
              <div v-if="!events.length" class="text-sm text-muted-foreground">Aucune activité.</div>
            </div>
          </div>
        </ScrollArea>
      </aside>
    </div>
  </div>
</template>
