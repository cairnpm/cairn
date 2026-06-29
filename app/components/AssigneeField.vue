<script setup lang="ts">
import { computed } from 'vue'
import { Plus, X } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu'

interface Assignee { user_id: string; name: string; avatar_url: string | null }
interface Member { id: string; name: string; avatar_url: string | null }

const props = defineProps<{ label: string; assignees: Assignee[]; members: Member[] }>()
const emit = defineEmits<{ add: [userId: string]; remove: [userId: string] }>()

const { t } = useUiLang()

const available = computed(() => props.members.filter(m => !props.assignees.some(a => a.user_id === m.id)))
</script>

<template>
  <div>
    <div class="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{{ label }}</div>
    <div class="flex flex-wrap items-center gap-1.5">
      <span v-for="a in assignees" :key="a.user_id" class="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 py-0.5 pl-0.5 pr-2 text-sm">
        <UserAvatar :name="a.name" :src="a.avatar_url" class="size-5" />
        {{ a.name }}
        <button type="button" class="text-muted-foreground hover:text-foreground" :title="t('common.remove', { name: a.name })" @click="emit('remove', a.user_id)"><X class="size-3" /></button>
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button variant="outline" size="sm" class="h-7 gap-1 rounded-full border-dashed text-muted-foreground"><Plus class="size-3.5" /> {{ t('common.add') }}</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem v-for="m in available" :key="m.id" class="gap-2" @select="emit('add', m.id)">
            <UserAvatar :name="m.name" :src="m.avatar_url" class="size-5" />{{ m.name }}
          </DropdownMenuItem>
          <div v-if="!available.length" class="px-2 py-1.5 text-xs text-muted-foreground">{{ t('common.allMembersAssigned') }}</div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </div>
</template>
