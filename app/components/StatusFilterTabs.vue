<script setup lang="ts">
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'

// Status-filter tabs with a count badge per tab. v-model is the active filter key.
defineProps<{ filters: { key: string; label: string; n: number }[] }>()
const model = defineModel<string>({ required: true })
</script>

<template>
  <Tabs :model-value="model" @update:model-value="(v) => model = String(v)">
    <TabsList>
      <TabsTrigger v-for="f in filters" :key="f.key" :value="f.key" class="group gap-1.5">
        {{ f.label }}
        <Badge variant="secondary" class="h-5 min-w-5 justify-center rounded-full border-transparent bg-background px-1.5 tabular-nums text-foreground group-data-[state=active]:bg-muted">{{ f.n }}</Badge>
      </TabsTrigger>
    </TabsList>
  </Tabs>
</template>
