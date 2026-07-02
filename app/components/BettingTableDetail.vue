<script setup lang="ts">
import { ExternalLink } from 'lucide-vue-next'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import type { BettingTableDetailData } from '~/types/betting'

const { t } = useUiLang()
const props = defineProps<{ data: BettingTableDetailData; compact?: boolean }>()
const emit = defineEmits<{ 'select-feature': [featureId: string] }>()

function impact(score: number) { return score >= 2.5 ? t('betting.impactVeryHigh') : score >= 1.5 ? t('betting.impactHigh') : score >= 0.8 ? t('betting.impactMedium') : t('betting.impactLow') }
const totalVotes = () => props.data.candidates.reduce((s, c) => s + c.voters.length, 0)
</script>

<template>
  <DetailLayout :aside-width="340" :compact="compact">
    <template #title>
      <h2 class="text-base font-semibold tracking-tight">{{ data.table.title }}</h2>
    </template>
    <template #header-action><slot name="header-action" /></template>
    <template #meta>
      <MetaField :label="t('betting.status')"><StatusBadge :status="data.table.status" /></MetaField>
      <MetaField :label="t('betting.createdBy')"><UserAvatar :name="data.table.owner_name" :src="data.table.owner_avatar" class="size-5" />{{ data.table.owner_name }}</MetaField>
      <MetaField :label="t('betting.candidates')"><span class="tabular-nums">{{ data.candidates.length }}</span></MetaField>
      <MetaField :label="t('betting.votes')"><span class="tabular-nums">{{ totalVotes() }}</span></MetaField>
      <MetaField v-if="data.table.validated_by" :label="t('betting.validatedBy')"><UserAvatar :name="data.table.validated_by" class="size-5" />{{ data.table.validated_by }}</MetaField>
      <MetaField v-if="data.table.hill_id" label="Hill">
        <NuxtLink :to="`/hills/${data.table.hill_id}`" class="inline-flex items-center gap-1 hover:underline">
          {{ data.table.hill_name || t('betting.cycle') }}
          <ExternalLink class="size-3.5 opacity-60" />
        </NuxtLink>
      </MetaField>
    </template>

    <div class="p-6">
          <SectionLabel class="mb-3">{{ t('betting.candidates') }} ({{ data.candidates.length }})</SectionLabel>
          <div class="rounded-lg border">
            <Table class="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead>{{ t('betting.candidate') }}</TableHead>
                  <TableHead class="w-20">{{ t('betting.votes') }}</TableHead>
                  <TableHead class="w-24">{{ t('betting.impact') }}</TableHead>
                  <TableHead class="w-28 text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="c in data.candidates" :key="c.id" class="cursor-pointer transition-colors hover:bg-muted/60" @click="emit('select-feature', c.feature_id)">
                  <TableCell>
                    <div class="flex items-center gap-2 font-medium">
                      <span class="truncate">{{ c.title_snap }}</span>
                      <Badge v-if="c.selected" class="shrink-0 text-[10px]">{{ t('betting.betBadge') }}</Badge>
                    </div>
                    <div v-if="!compact" class="truncate text-xs text-muted-foreground">{{ c.problem_snap }}</div>
                  </TableCell>
                  <TableCell>
                    <AvatarStack :people="c.voters.map(v => ({ name: v }))" :size="5" />
                  </TableCell>
                  <TableCell><Badge variant="outline">{{ impact(c.score) }}</Badge></TableCell>
                  <TableCell class="text-right" @click.stop><slot name="candidate-action" :candidate="c" /></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
          <div v-if="$slots['candidates-footer']" class="mt-4 flex justify-end">
            <slot name="candidates-footer" />
          </div>
        </div>

    <template #aside>
      <ActivityTimeline :events="data.events" :title="t('betting.timeline')" :empty-text="t('betting.noActivity')" scope="betting" />
    </template>
  </DetailLayout>
</template>
