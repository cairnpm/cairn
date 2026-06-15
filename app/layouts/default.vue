<script setup lang="ts">
import { computed, watch } from 'vue'

const route = useRoute()
const bike = useBicycle()
const { screen } = bike

// Closing panels (Sheets) when navigating between pages.
watch(() => route.path, () => {
  bike.clearTicket()
  bike.clearCandidate()
  bike.clearHillFeature()
})

const contentPad = computed(() => (screen.value === 'intake' ? '0' : '24px'))
const contentOverflow = computed(() => (screen.value === 'intake' ? 'hidden' : 'auto'))
</script>

<template>
  <div style="display: flex; height: 100vh; overflow: hidden; background: #f4f4f5;">
    <AppSidebar />

    <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden;">
      <AppHeader />

      <div :style="{ flex: 1, overflow: contentOverflow, padding: contentPad }">
        <slot />
      </div>
    </div>
  </div>
</template>
