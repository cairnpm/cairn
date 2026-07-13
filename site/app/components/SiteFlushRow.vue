<script setup lang="ts">
import { computed } from 'vue'

// The row of cells under a flush band's heading. Rail to rail: the top rule spans the full width, and
// there is no bottom rule — the next section's border-top is the bottom rule, so the two never double up.
//
// Separators come from `gap-px` over `bg-border` rather than `divide-*` or per-cell borders: it survives
// the 2-up wrap on small screens without dropping a stray line against the page rails.
//
// Cell padding lives here (child selectors) so every row on the page is padded identically; the first and
// last cells align their text with the section gutter instead of hugging the rails.
const props = defineProps<{ cols: 3 | 4 | 5 }>()

// Static literals so Tailwind's scanner emits them.
const COLS: Record<number, string> = { 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4', 5: 'lg:grid-cols-5' }
const colsCls = computed(() => COLS[props.cols] ?? COLS[3])
</script>

<template>
  <div
    :class="[
      'grid gap-px border-t bg-border sm:grid-cols-2',
      '[&>*]:min-w-0 [&>*]:bg-background [&>*]:p-6 lg:[&>*]:px-8 lg:[&>*]:py-10',
      'lg:[&>*:first-child]:pl-16 lg:[&>*:last-child]:pr-16',
      colsCls,
    ]"
  >
    <slot />
  </div>
</template>
