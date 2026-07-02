<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ListTodo, Mountain, Target } from 'lucide-vue-next'
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { qk } from '~/utils/queryKeys'

// Global Cmd/Ctrl+K palette: search features / betting tables / hills and jump to their detail page.
// Open-state is shared via useSearchPalette so the layout shortcut and the sidebar button both drive it.
const { open, close } = useSearchPalette()
const { t } = useUiLang()

// Reuse the same query keys as the screens → the lists are shared/cached, not re-fetched.
const { data: features } = useApiData<{ id: string; title: string; status: string; updated_at: string }[]>(qk.features, '/api/features', { default: () => [] })
const { data: betting } = useApiData<{ id: string; title: string; status: string; created_at: string }[]>(qk.bettingTables, '/api/betting-tables', { default: () => [] })
const { data: hills } = useApiData<{ id: string; name: string; status: string; starts_at: string | null }[]>(qk.hills, '/api/hills', { default: () => [] })

// All items stay mounted (sorted most-recent-first) so CommandInput's filter always sees the full set.
// Idle (empty query) just HIDES everything past the 3rd per group via a class — no remount, so typing
// filters correctly across everything. `query` mirrors the input via a native listener (the command
// input's value isn't exposed to the parent), attached when the palette opens.
const query = ref('')
function byRecent<T>(key: keyof T) {
  return (a: T, b: T) => String(b[key] ?? '').localeCompare(String(a[key] ?? ''))
}
const feat = computed(() => [...features.value].sort(byRecent('updated_at')))
const bett = computed(() => [...betting.value].sort(byRecent('created_at')))
const hil = computed(() => [...hills.value].sort(byRecent('starts_at')))
// The command input lives in a teleported portal that mounts on open, so delegate on the document
// (capture phase) rather than binding the element directly — reliable whenever/wherever it mounts.
function onDocInput(e: Event) {
  const el = e.target as HTMLElement | null
  if (el?.getAttribute?.('data-slot') === 'command-input') query.value = (el as HTMLInputElement).value
}
onMounted(() => document.addEventListener('input', onDocInput, true))
onBeforeUnmount(() => document.removeEventListener('input', onDocInput, true))
watch(open, (v) => { if (!v) query.value = '' })

function go(path: string) {
  close()
  navigateTo(path)
}
</script>

<template>
  <CommandDialog v-model:open="open" :title="t('search.title')" :description="t('search.placeholder')">
    <CommandInput :placeholder="t('search.placeholder')" />
    <CommandList :class="{ 'palette-idle': !query }">
      <CommandEmpty>{{ t('search.empty') }}</CommandEmpty>
      <CommandGroup v-if="feat.length" :heading="t('nav.backlog')">
        <CommandItem v-for="f in feat" :key="f.id" :value="`f ${f.id} ${f.title}`" @select="go(`/features/${f.id}`)">
          <ListTodo /><span class="truncate">{{ f.title }}</span><span class="ml-auto shrink-0 text-xs uppercase text-muted-foreground">{{ f.status }}</span>
        </CommandItem>
      </CommandGroup>
      <CommandGroup v-if="bett.length" :heading="t('nav.betting')">
        <CommandItem v-for="b in bett" :key="b.id" :value="`b ${b.id} ${b.title}`" @select="go(`/betting/${b.id}`)">
          <Target /><span class="truncate">{{ b.title }}</span><span class="ml-auto shrink-0 text-xs uppercase text-muted-foreground">{{ b.status }}</span>
        </CommandItem>
      </CommandGroup>
      <CommandGroup v-if="hil.length" :heading="t('nav.hills')">
        <CommandItem v-for="h in hil" :key="h.id" :value="`h ${h.id} ${h.name}`" @select="go(`/hills/${h.id}`)">
          <Mountain /><span class="truncate">{{ h.name }}</span><span class="ml-auto shrink-0 text-xs uppercase text-muted-foreground">{{ h.status }}</span>
        </CommandItem>
      </CommandGroup>
    </CommandList>
  </CommandDialog>
</template>

<!-- Idle (empty query): show only the first 3 items per group. The command component removes non-matching
     items from the DOM while searching, so this sibling rule naturally lifts once the user types. -->
<style>
.palette-idle [data-slot="command-item"] ~ [data-slot="command-item"] ~ [data-slot="command-item"] ~ [data-slot="command-item"] {
  display: none;
}
</style>
