<script setup lang="ts">
import { useTracking, type Surface } from '../composables/useTracking'

// Every outbound link on the site — one place for the styling, the rel policy and the CTA event.
// Callers add layout classes (`class="hidden sm:block"`); Vue merges them onto the anchor.
const props = defineProps<{ href: string; surface: Surface }>()

const { ctaClicked } = useTracking()
</script>

<template>
  <a
    :href="props.href" target="_blank" rel="noopener noreferrer"
    class="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
    @click="ctaClicked(props.href, props.surface)"
  ><slot /></a>
</template>
