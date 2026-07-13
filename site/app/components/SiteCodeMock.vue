<script setup lang="ts">
import { Check, Search } from 'lucide-vue-next'

// The agent greps the linked repo before it shapes, so "is X built yet?" is answered against the code
// rather than against a stale ticket. Citations are the proof, and they never leave the box.
const HITS = [
  { file: 'server/gateway/intake.ts', line: 142, snippet: 'export async function dedupeAgainstBacklog(' },
  { file: 'server/db/softDelete.ts', line: 31, snippet: 'export function discardSignal(id: string) {' },
]
</script>

<template>
  <SitePanel title="cairn — product context">
    <div class="flex flex-col gap-4 p-4">
      <div class="flex items-center gap-2 font-mono text-[12px] text-muted-foreground">
        <Search class="size-3.5 shrink-0" />
        <span>grep -r "dedupe" <span class="text-foreground">acme/product</span></span>
      </div>

      <div class="flex flex-col gap-3">
        <div v-for="hit in HITS" :key="hit.file" class="font-mono text-[12px]">
          <div class="text-muted-foreground">{{ hit.file }}:{{ hit.line }}</div>
          <div class="mt-1.5 border-l-2 pl-3 text-foreground/75">{{ hit.snippet }}</div>
        </div>
      </div>

      <SiteRule />

      <div class="flex items-start gap-2.5">
        <Check class="mt-0.5 size-4 shrink-0" />
        <p class="text-[13px] leading-[21px] text-muted-foreground">
          <span class="font-medium text-foreground">Already shipped.</span>
          Dedupe-on-capture exists at
          <code class="font-mono text-foreground/80">server/gateway/intake.ts:142</code>.
          Routed the signal onto feature #24 instead of opening a duplicate.
        </p>
      </div>
    </div>
  </SitePanel>
</template>
