<script setup lang="ts">
import { ScrollArea } from '@/components/ui/scroll-area'
import { useUiLang } from '~/composables/useUiLang'

// Right-hand event feed shared by every detail view: avatar + connector + summary + time. The line is
// RENDERED here from the event's structured (action, detail, actor) so it follows the viewer's language
// — not the language it was written in. Falls back to the stored `summary` for anything not handled
// (old events, or details missing a name we didn't enrich). `title`/`emptyText` come pre-translated.
interface Ev { seq: number; actor: string; action: string; summary: string; detail?: string | null; created_at: string }
const props = defineProps<{
  events: Ev[]
  title: string
  emptyText: string
  scope?: 'feature' | 'betting' // disambiguates deleted/restored (feature vs betting table)
}>()

const { t } = useUiLang()

// detail is a JSON string from SQLite — parse defensively at this boundary.
function parseDetail(d?: string | null): Record<string, unknown> {
  if (!d) return {}
  try { const o = JSON.parse(d); return o && typeof o === 'object' ? o as Record<string, unknown> : {} }
  catch { return {} }
}
const str = (v: unknown) => (v == null ? '' : String(v))
function fields(changes: unknown): string {
  if (!Array.isArray(changes)) return ''
  return changes.map(c => t(`activity.field.${(c as { field?: string }).field}`)).join(', ')
}

function render(e: Ev): string {
  const d = parseDetail(e.detail)
  const actor = e.actor
  switch (e.action) {
    case 'created': return t('activity.created', { actor })
    case 'signal_added': {
      const ch = d.changes
      return Array.isArray(ch) && ch.length ? t('activity.signalRefined', { actor, fields: fields(ch) }) : t('activity.signalAdded', { actor })
    }
    case 'field_updated': return t('activity.fieldUpdated', { actor, field: t(`activity.field.${str(d.field)}`) })
    case 'bet': return t('activity.bet', { actor })
    case 'pass': return t('activity.pass', { actor })
    case 'defer': return t('activity.defer', { actor })
    case 'assigned': return d.name ? t('activity.assigned', { actor, member: str(d.name), role: t(`activity.role.${str(d.role)}`) }) : e.summary
    case 'unassigned': return d.name ? t('activity.unassigned', { actor, member: str(d.name), role: t(`activity.role.${str(d.role)}`) }) : e.summary
    case 'merged':
      return d.from && d.into ? t('activity.merged', { actor, from: str(d.from), into: str(d.into) })
        : d.into ? t('activity.mergedInto', { actor, into: str(d.into) })
          : e.summary
    case 'pr_merged': return d.repo ? t('activity.prMerged', { repo: str(d.repo), pr: str(d.pr_number) }) : e.summary
    case 'pr_linked': return d.repo ? t('activity.prLinked', { repo: str(d.repo), pr: str(d.pr_number) }) : e.summary
    case 'discarded': return t('activity.discarded', { actor })
    case 'stale': return d.days != null ? t('activity.stale', { days: str(d.days) }) : e.summary
    case 'deleted': return t(props.scope === 'betting' ? 'activity.bettingDeleted' : 'activity.deleted', { actor })
    case 'restored': return t(props.scope === 'betting' ? 'activity.bettingRestored' : 'activity.restored', { actor })
    case 'generated': return t('activity.bettingGenerated', { actor, n: str(d.candidates) })
    case 'validated': return d.hill_name ? t('activity.bettingValidated', { actor, hill: str(d.hill_name), n: Array.isArray(d.bet) ? d.bet.length : '' }) : e.summary
    case 'cancelled': return t('activity.bettingCancelled', { actor })
    case 'vote_cast': return d.title ? t('activity.voteCast', { actor, title: str(d.title) }) : e.summary
    case 'vote_cleared': return d.title ? t('activity.voteCleared', { actor, title: str(d.title) }) : e.summary
    default: return e.summary
  }
}
</script>

<template>
  <ScrollArea class="h-full">
    <div class="p-6">
      <div class="mb-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">{{ title }} ({{ events.length }})</div>
      <div class="relative flex flex-col gap-4">
        <div v-for="(e, i) in events" :key="e.seq" class="flex gap-2.5">
          <div class="relative flex flex-col items-center">
            <UserAvatar :name="e.actor" class="size-6 shrink-0" />
            <div v-if="i < events.length - 1" class="mt-1 w-px flex-1 bg-border" />
          </div>
          <div class="min-w-0 pb-1 text-sm">
            <div class="leading-snug">{{ render(e) }}</div>
            <TimeAgo :date="e.created_at" class="mt-0.5 block text-xs text-muted-foreground" />
          </div>
        </div>
        <div v-if="!events.length" class="text-sm text-muted-foreground">{{ emptyText }}</div>
      </div>
    </div>
  </ScrollArea>
</template>
