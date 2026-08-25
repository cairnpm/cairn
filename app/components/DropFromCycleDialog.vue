<script setup lang="ts">
import { ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

// Shape Up's circuit breaker. Not a confirmation — a decision: the rationale is required, because the
// feature goes back to the pool and someone will have to argue for it again at the next table.
const { t } = useUiLang()
const props = defineProps<{ title: string; busy?: boolean }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ confirm: [rationale: string] }>()

const rationale = ref('')
watch(open, (v) => { if (v) rationale.value = '' })
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ t('feature.drop.title') }}</DialogTitle>
        <DialogDescription>{{ t('feature.drop.description', { title: props.title }) }}</DialogDescription>
      </DialogHeader>
      <div class="grid gap-2">
        <Label for="drop-why">{{ t('feature.drop.why') }}</Label>
        <Textarea id="drop-why" v-model="rationale" rows="3" :placeholder="t('feature.drop.whyPlaceholder')" />
      </div>
      <DialogFooter>
        <Button variant="outline" :disabled="busy" @click="open = false">{{ t('backlog.cancel') }}</Button>
        <Button :disabled="busy || !rationale.trim()" @click="emit('confirm', rationale.trim())">
          {{ t('feature.drop.confirm') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
