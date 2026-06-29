<script lang="ts" setup>
import { Toaster as Sonner, type ToasterProps } from 'vue-sonner'
import 'vue-sonner/style.css'

// shadcn-vue Sonner wrapper. richColors → success is green, error is red (confirm vs signal).
const props = withDefaults(defineProps<ToasterProps>(), {
  theme: 'dark',
  position: 'bottom-right',
  richColors: true,
})
</script>

<template>
  <Sonner
    class="toaster group"
    v-bind="props"
    :toast-options="{
      classes: {
        toast: 'group toast group-[.toaster]:rounded-lg group-[.toaster]:border-border group-[.toaster]:shadow-lg',
        description: 'group-[.toast]:text-muted-foreground',
        actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
      },
    }"
  />
</template>
