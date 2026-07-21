<script setup lang="ts">
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

// Fixtures only — the table, the status pills and the avatar stack are the product's own components.
// The landing renders the shipped UI, so it can't drift the way a screenshot would.
const ROWS = [
  { title: 'Merge duplicate signals at capture', status: 'building', appetite: '6 weeks', people: [{ name: 'Nadia' }, { name: 'Tom' }] },
  { title: 'Grep the repo before shaping', status: 'bet', appetite: '6 weeks', people: [{ name: 'Léo' }] },
  { title: 'Quorum before a table is validated', status: 'shaped', appetite: '2 weeks', people: [{ name: 'Marie' }] },
  { title: 'Discard noise without deleting it', status: 'shaped', appetite: '1 week', people: [{ name: 'Marie' }, { name: 'Tom' }] },
  { title: 'Activity log in your language', status: 'done', appetite: '2 weeks', people: [{ name: 'Nadia' }] },
]
</script>

<template>
  <SitePanel title="cairn — backlog">
    <!-- The product's table is dense by design (px-2), which reads as cramped when the panel is the hero
         shot. Widen the gutter here only — the row rules stay full-bleed, so the frame keeps its grid. -->
    <Table class="[&_td]:px-5 [&_th]:px-5">
      <TableHeader>
        <TableRow class="hover:bg-transparent">
          <TableHead>Feature</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Appetite</TableHead>
          <TableHead class="text-right">Shapers</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="row in ROWS" :key="row.title">
          <TableCell class="max-w-[240px] truncate font-medium">{{ row.title }}</TableCell>
          <TableCell><StatusBadge :status="row.status" /></TableCell>
          <TableCell class="whitespace-nowrap text-muted-foreground">{{ row.appetite }}</TableCell>
          <TableCell>
            <div class="flex justify-end"><AvatarStack :people="row.people" /></div>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </SitePanel>
</template>
