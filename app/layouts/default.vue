<script setup lang="ts">
import { watch } from 'vue'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'

const route = useRoute()
const bike = useBicycle()
const { breadcrumb } = bike

watch(() => route.path, () => {
  bike.clearFeature()
  bike.clearBet()
})
</script>

<template>
  <SidebarProvider>
    <AppSidebar />
    <SidebarInset class="min-w-0 overflow-hidden">
      <header class="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger class="-ml-1" />
        <Separator orientation="vertical" class="mr-2 h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem class="hidden md:block text-muted-foreground">Workspace</BreadcrumbItem>
            <template v-for="(c, i) in breadcrumb" :key="i">
              <BreadcrumbSeparator class="hidden md:block" />
              <BreadcrumbItem>
                <BreadcrumbLink v-if="c.to && i < breadcrumb.length - 1" as-child>
                  <NuxtLink :to="c.to">{{ c.label }}</NuxtLink>
                </BreadcrumbLink>
                <BreadcrumbPage v-else>{{ c.label }}</BreadcrumbPage>
              </BreadcrumbItem>
            </template>
          </BreadcrumbList>
        </Breadcrumb>
      </header>
      <main class="flex-1 min-h-0 overflow-hidden">
        <slot />
      </main>
    </SidebarInset>
  </SidebarProvider>
</template>
