<script setup lang="ts">
import { ExternalLink } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { FeatureDetailData } from '~/types/feature'

defineProps<{ detail: FeatureDetailData }>()

function relTime(iso: string): string {
  const d = Date.parse(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z')
  if (Number.isNaN(d)) return '—'
  const s = Math.floor((Date.now() - d) / 1000)
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  if (s < 2592000) return `${Math.floor(s / 86400)}j`
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
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
          <div v-for="p in PITCH" :key="p.key" v-show="detail.feature[p.key]">
            <div class="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{{ p.label }}</div>
            <p class="leading-relaxed">{{ detail.feature[p.key] }}</p>
          </div>
          <div v-if="detail.attachments.length">
            <div class="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Pièces jointes</div>
            <div class="flex flex-wrap gap-2">
              <a v-for="a in detail.attachments" :key="a.id" :href="`/api/attachments/${a.id}`" target="_blank">
                <img v-if="a.kind === 'image'" :src="`/api/attachments/${a.id}`" :title="a.filename" class="size-16 rounded-md border object-cover">
                <Badge v-else variant="outline" class="gap-1">📄 {{ a.filename }}</Badge>
              </a>
            </div>
          </div>
          <div v-if="detail.feedback.length">
            <div class="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Signaux ({{ detail.feedback.length }})</div>
            <div class="flex flex-col gap-2">
              <div v-for="fb in detail.feedback" :key="fb.id" class="rounded-md border bg-muted/40 p-3">
                <div class="font-medium">{{ fb.content }}</div>
                <div class="mt-1 text-xs text-muted-foreground">{{ fb.source }} · {{ fb.classification }}</div>
              </div>
            </div>
          </div>
          <div v-if="detail.decisions.length">
            <div class="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Décisions</div>
            <div v-for="d in detail.decisions" :key="d.id" class="mb-2 rounded-md border bg-muted/40 p-3">
              <div class="mb-1 flex items-center gap-2"><Badge variant="secondary" class="capitalize">{{ d.verdict }}</Badge><span class="text-xs text-muted-foreground">{{ relTime(d.decided_at) }}</span></div>
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
            <div class="mb-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">Activité ({{ detail.events.length }})</div>
            <div class="relative flex flex-col gap-4">
              <div v-for="(e, i) in detail.events" :key="e.seq" class="flex gap-2.5">
                <div class="relative flex flex-col items-center">
                  <UserAvatar :name="e.actor" class="size-6 shrink-0" />
                  <div v-if="i < detail.events.length - 1" class="mt-1 w-px flex-1 bg-border" />
                </div>
                <div class="min-w-0 pb-1 text-sm">
                  <div class="leading-snug">{{ e.summary }}</div>
                  <div class="mt-0.5 text-xs text-muted-foreground">{{ relTime(e.created_at) }}</div>
                </div>
              </div>
              <div v-if="!detail.events.length" class="text-sm text-muted-foreground">Aucune activité.</div>
            </div>
          </div>
        </ScrollArea>
      </aside>
    </div>
  </div>
</template>
