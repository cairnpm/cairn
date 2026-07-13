<template>
  <!-- Bracketed micro-label. The site's only ornament: it carries the "engineering note" register
       without adding a colour to a deliberately monochrome palette. -->
  <div class="flex items-center font-mono text-[11px] uppercase tracking-[0.09em] text-muted-foreground">
    <span class="text-muted-foreground/40">[</span>
    <span class="px-1.5"><slot /></span>
    <span class="text-muted-foreground/40">]</span>
  </div>
</template>
