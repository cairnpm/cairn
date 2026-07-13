<script setup lang="ts">
// The whole model on one line, straight from docs/intake.md §1: signals bubble up and condense into a
// shaped pitch, get bet on explicitly, and only then become work. The status pills are the product's.
const STAGES = [
  {
    step: '01',
    name: 'Raw signal',
    status: null,
    body: 'A Slack thread, a bug report, a whole transcript. Stored verbatim, hashed and embedded — even the noise, which is archived rather than destroyed.',
  },
  {
    step: '02',
    name: 'Shaped',
    status: 'shaped',
    body: 'The agent turns it into a pitch: a real problem, a fixed appetite, rabbit holes, no-gos. Not a reworded request.',
  },
  {
    step: '03',
    name: 'Betting table',
    status: null,
    body: 'A scored menu of what is worth doing. Members vote, the owner validates. Nothing is ever bet automatically.',
  },
  {
    step: '04',
    name: 'Hill',
    status: 'bet',
    body: 'The bet opens a cycle and scope freezes: from here, no signal can attach itself to work already in flight.',
  },
  {
    step: '05',
    name: 'Done',
    status: 'done',
    body: 'No reopening. A new need shapes a fresh iteration that supersedes the old one, and says so.',
  },
]
</script>

<template>
  <SiteBand label="The loop" title="You don’t fill a backlog. Signals bubble up." flush>
    <SiteFlushRow :cols="5">
      <div v-for="stage in STAGES" :key="stage.step" class="flex flex-col">
        <div class="flex items-center justify-between gap-2">
          <span class="font-mono text-[11px] tracking-[0.09em] text-muted-foreground/50">{{ stage.step }}</span>
          <StatusBadge v-if="stage.status" :status="stage.status" />
        </div>
        <div class="mt-4 text-[14px] font-medium">{{ stage.name }}</div>
        <p class="mt-2 text-[13px] leading-[21px] text-muted-foreground">{{ stage.body }}</p>
      </div>
    </SiteFlushRow>
  </SiteBand>
</template>
