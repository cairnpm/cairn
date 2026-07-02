<script setup lang="ts">
import { ref } from 'vue'
import { Download, Expand, FileText } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

// Clickable attachment thumbnail (image) / chip (doc) that opens a simple preview modal. Shared by
// the feature signal cards and the intake chat messages. Nested inside Sheets/Dialogs safely — the
// modal is role="dialog", which the keepOverlayOpen guard already whitelists.
const props = withDefaults(defineProps<{
  attachment: { id: string; filename: string; kind: string }
  size?: string // Tailwind size utility for the image thumbnail
  tone?: 'default' | 'onPrimary' // 'onPrimary' = sitting on a bg-primary surface (intake user bubble)
}>(), { size: 'size-14', tone: 'default' })

const open = ref(false)
const src = `/api/attachments/${props.attachment.id}`
</script>

<template>
  <button type="button" :title="attachment.filename" class="group relative inline-block cursor-pointer rounded-md" @click="open = true">
    <template v-if="attachment.kind === 'image'">
      <img :src="src" :class="['block rounded-md border object-cover', size]">
      <span class="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md bg-black/0 opacity-0 transition group-hover:bg-black/50 group-hover:opacity-100">
        <Expand class="size-5 text-white" />
      </span>
    </template>
    <Badge v-else variant="outline" :class="['max-w-full gap-1.5 font-normal transition-colors', tone === 'onPrimary' ? 'border-primary-foreground/25 bg-primary-foreground/10 text-primary-foreground group-hover:bg-primary-foreground/20' : 'group-hover:bg-accent']"><FileText class="size-3.5 shrink-0" /><span class="truncate">{{ attachment.filename || 'Document' }}</span></Badge>
  </button>

  <Dialog v-model:open="open">
    <DialogContent class="max-w-3xl gap-0 overflow-hidden p-0">
      <DialogTitle class="border-b px-4 py-3 text-sm font-medium">{{ attachment.filename }}</DialogTitle>
      <img v-if="attachment.kind === 'image'" :src="src" :alt="attachment.filename" class="max-h-[78vh] w-full bg-muted/30 object-contain">
      <div v-else class="flex flex-col items-center gap-3 p-10 text-center text-sm text-muted-foreground">
        <span class="inline-flex items-center gap-1.5"><FileText class="size-4" /> {{ attachment.filename || 'Document' }}</span>
        <Button as-child variant="outline" size="sm">
          <a :href="src" target="_blank" rel="noopener"><Download class="size-3.5" /> Ouvrir le document</a>
        </Button>
      </div>
    </DialogContent>
  </Dialog>
</template>
