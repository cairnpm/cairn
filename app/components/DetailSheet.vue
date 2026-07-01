<script setup lang="ts">
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { ExternalLink } from 'lucide-vue-next'

// Quick-view Sheet shell shared by the list screens: the sized SheetContent, the keep-open guards,
// the sr-only title, and the "open the full page" corner link. The detail component goes in the
// default slot; `#actions` is for an extra corner control (Betting's in-sheet delete menu).
const open = defineModel<boolean>('open', { default: false })
defineProps<{
  ready: boolean
  title: string
  openPageTo: string
  openPageTitle: string
  openPageLabel: string
}>()
</script>

<template>
  <Sheet v-model:open="open">
    <SheetContent class="flex w-full flex-col gap-0 p-0 sm:max-w-[min(92vw,1100px)]" @interact-outside="keepOverlayOpen" @focus-outside="keepOverlayOpen">
      <!-- Always render the title + description (a11y) even before the content loads. -->
      <SheetTitle class="sr-only">{{ title }}</SheetTitle>
      <SheetDescription class="sr-only">{{ title }}</SheetDescription>
      <template v-if="ready">
        <slot name="actions" />
        <NuxtLink
          :to="openPageTo" :title="openPageTitle"
          class="ring-offset-background focus:ring-ring absolute top-4 right-12 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden"
        >
          <ExternalLink class="size-4" />
          <span class="sr-only">{{ openPageLabel }}</span>
        </NuxtLink>
        <slot />
      </template>
    </SheetContent>
  </Sheet>
</template>
