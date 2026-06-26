<script setup lang="ts">
import { computed } from 'vue'
import { ChevronsUpDown, Inbox, Languages, ListTodo, LogOut, Mountain, Settings2, Sparkles, Target } from 'lucide-vue-next'
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarRail,
} from '@/components/ui/sidebar'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface Overview { features_total: number; hills_active: number; betting_total: number }

const bike = useBicycle()
const { screen, author, role } = bike
const { t, locale, setLocale } = useUiLang()
const { data: ov } = await useFetch<Overview>('/api/overview', { getCachedData: getFreshData })

const items = computed(() => [
  { id: 'intake', label: t('nav.intake'), to: '/', icon: Inbox, badge: 'AI' },
  { id: 'backlog', label: t('nav.backlog'), to: '/backlog', icon: ListTodo, badge: ov.value?.features_total },
  { id: 'betting', label: t('nav.betting'), to: '/betting', icon: Target, badge: ov.value?.betting_total },
  { id: 'hills', label: t('nav.hills'), to: '/hills', icon: Mountain, badge: ov.value?.hills_active },
  { id: 'settings', label: t('nav.settings'), to: '/settings', icon: Settings2 },
])
</script>

<template>
  <Sidebar collapsible="icon">
    <SidebarHeader>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" as-child>
            <NuxtLink to="/">
              <div class="bg-primary text-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                <Sparkles class="size-4" />
              </div>
              <div class="grid flex-1 text-left text-sm leading-tight">
                <span class="truncate font-semibold">Bicycle</span>
                <span class="truncate text-xs text-muted-foreground">Product OS</span>
              </div>
            </NuxtLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>

    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupLabel>Workspace</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem v-for="it in items" :key="it.id">
              <SidebarMenuButton as-child :is-active="screen === it.id" :tooltip="it.label">
                <NuxtLink :to="it.to">
                  <component :is="it.icon" />
                  <span>{{ it.label }}</span>
                </NuxtLink>
              </SidebarMenuButton>
              <SidebarMenuBadge v-if="it.badge != null">{{ it.badge }}</SidebarMenuBadge>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>

    <SidebarFooter>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <SidebarMenuButton size="lg" class="data-[state=open]:bg-sidebar-accent">
                <UserAvatar :name="author" class="size-8 rounded-lg" />
                <div class="grid flex-1 text-left text-sm leading-tight">
                  <span class="truncate font-semibold">{{ author }}</span>
                  <span class="truncate text-xs text-muted-foreground capitalize">{{ role }}</span>
                </div>
                <ChevronsUpDown class="ml-auto size-4" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent class="w-(--reka-dropdown-menu-trigger-width) min-w-56 rounded-lg" side="right" align="end" :side-offset="4">
              <DropdownMenuLabel class="flex items-center gap-2 font-normal">
                <UserAvatar :name="author" class="size-8 rounded-lg" />
                <div class="grid flex-1 text-left text-sm leading-tight">
                  <span class="truncate font-semibold">{{ author }}</span>
                  <span class="truncate text-xs text-muted-foreground capitalize">{{ role }}</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuLabel class="text-xs text-muted-foreground flex items-center gap-2"><Languages class="size-3.5" /> {{ t('menu.language') }}</DropdownMenuLabel>
              <div class="flex gap-1 px-1 pb-1">
                <Button v-for="l in (['fr','en'] as const)" :key="l" :variant="locale === l ? 'default' : 'outline'" size="sm" class="h-7 flex-1" @click="setLocale(l)">{{ l.toUpperCase() }}</Button>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem as-child>
                <NuxtLink to="/settings"><Settings2 /> {{ t('menu.settings') }}</NuxtLink>
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" @click="bike.logout()"><LogOut /> {{ t('menu.logout') }}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
    <SidebarRail />
  </Sidebar>
</template>
