<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ExternalLink } from 'lucide-vue-next'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import type { FeatureDetailData } from '~/types/feature'

// Shows a feature's detail either as a side Sheet or as a centered modal Dialog.
const props = defineProps<{ mode: 'sheet' | 'dialog' }>()
const featureId = defineModel<string | null>('featureId', { default: null })

const detail = ref<FeatureDetailData | null>(null)
watch(featureId, async (id) => {
  detail.value = null
  if (id) detail.value = await $fetch<FeatureDetailData>(`/api/features/${id}`)
})
const open = computed({
  get: () => featureId.value !== null,
  set: (v: boolean) => { if (!v) featureId.value = null },
})
</script>

<template>
  <Sheet v-if="mode === 'sheet'" v-model:open="open">
    <SheetContent class="flex w-full flex-col gap-0 p-0 sm:max-w-[min(92vw,1100px)]">
      <template v-if="detail">
        <SheetTitle class="sr-only">{{ detail.feature.title }}</SheetTitle>
        <NuxtLink
          :to="`/features/${detail.feature.id}`" title="Ouvrir la page de la feature"
          class="ring-offset-background focus:ring-ring absolute top-4 right-12 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden"
        >
          <ExternalLink class="size-4" />
          <span class="sr-only">Ouvrir la page</span>
        </NuxtLink>
        <FeatureDetail :detail="detail" />
      </template>
    </SheetContent>
  </Sheet>

  <Dialog v-else v-model:open="open">
    <DialogContent class="flex h-[85vh] w-[92vw] max-w-[1100px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1100px]">
      <template v-if="detail">
        <DialogTitle class="sr-only">{{ detail.feature.title }}</DialogTitle>
        <NuxtLink
          :to="`/features/${detail.feature.id}`" title="Ouvrir la page de la feature"
          class="ring-offset-background focus:ring-ring absolute top-4 right-12 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden"
        >
          <ExternalLink class="size-4" />
          <span class="sr-only">Ouvrir la page</span>
        </NuxtLink>
        <FeatureDetail :detail="detail" />
      </template>
    </DialogContent>
  </Dialog>
</template>
