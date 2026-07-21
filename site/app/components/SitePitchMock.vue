<script setup lang="ts">
// A shaped pitch, rendered with the product's own MetaField / SectionLabel / StatusBadge / AvatarStack:
// a real problem, a fixed appetite, and the no-gos that keep scope frozen once the bet is placed.
const BUILDERS = [{ name: 'Nadia' }, { name: 'Tom' }]
</script>

<template>
  <SitePanel title="cairn — pitch">
    <div class="flex flex-col gap-5 p-5">
      <div class="flex items-start justify-between gap-4">
        <h3 class="text-[15px] font-medium leading-tight">Merge duplicate signals at capture</h3>
        <StatusBadge status="bet" />
      </div>

      <div class="grid grid-cols-3 gap-4">
        <MetaField label="Appetite">6 weeks</MetaField>
        <MetaField label="Hill">Cycle 12</MetaField>
        <MetaField label="Builders"><AvatarStack :people="BUILDERS" :size="5" /></MetaField>
      </div>

      <SiteRule />

      <div class="flex flex-col gap-4">
        <div>
          <SectionLabel class="mb-1.5">Problem</SectionLabel>
          <p class="text-[13px] leading-[21px] text-muted-foreground">
            The same request lands three times from three channels. Whoever triages last has no way to
            know it is already in the backlog.
          </p>
        </div>
        <div>
          <SectionLabel class="mb-1.5">No-gos</SectionLabel>
          <p class="text-[13px] leading-[21px] text-muted-foreground">
            No silent auto-merge. The agent proposes, a human confirms — writing only ever happens on
            confirmation.
          </p>
        </div>
      </div>
    </div>
  </SitePanel>
</template>
