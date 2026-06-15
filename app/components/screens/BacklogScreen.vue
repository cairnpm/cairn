<script setup lang="ts">
import { computed } from 'vue'
import { ChevronDown, ChevronsUpDown, ChevronUp, Columns3, Table as TableIcon } from 'lucide-vue-next'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'

const bike = useBicycle()
const { stats, visibleTickets, pipeline, ticketDetail, statusFilter, sortKey, sortDir, view } = bike

const columns = [
  { key: 'title', label: 'Ticket' },
  { key: 'status', label: 'Statut' },
  { key: 'effort', label: 'Effort' },
  { key: 'priority', label: 'Priorité' },
  { key: 'hill', label: 'Hill' },
]

const open = computed({
  get: () => ticketDetail.value !== null,
  set: (v: boolean) => { if (!v) bike.clearTicket() },
})
</script>

<template>
  <div style="display: flex; flex-direction: column; gap: 16px;">
    <!-- Stats -->
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;">
      <div v-for="s in stats" :key="s.label" style="background: white; border: 1px solid #e4e4e7; border-radius: 8px; padding: 16px 18px;">
        <div style="font-size: 12px; color: #71717a; font-weight: 500; margin-bottom: 6px;">{{ s.label }}</div>
        <div style="font-size: 28px; font-weight: 700; color: #18181b; line-height: 1;">{{ s.count }}</div>
      </div>
    </div>

    <!-- Status filter (left) + view selector (right) -->
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
      <Tabs :model-value="statusFilter" @update:model-value="bike.setStatusFilter(String($event))">
        <TabsList>
          <TabsTrigger value="Tous">Tous</TabsTrigger>
          <TabsTrigger value="En cours">En cours</TabsTrigger>
          <TabsTrigger value="À faire">À faire</TabsTrigger>
          <TabsTrigger value="Fait">Fait</TabsTrigger>
        </TabsList>
      </Tabs>

      <Tabs :model-value="view" @update:model-value="bike.setView($event === 'pipeline' ? 'pipeline' : 'table')">
        <TabsList>
          <TabsTrigger value="table"><TableIcon /> Tableau</TabsTrigger>
          <TabsTrigger value="pipeline"><Columns3 /> Pipeline</TabsTrigger>
        </TabsList>
      </Tabs>
    </div>

    <!-- Sortable shadcn table -->
    <div v-if="view === 'table'" style="background: white; border: 1px solid #e4e4e7; border-radius: 8px; overflow: hidden;">
      <Table>
        <TableHeader>
          <TableRow style="background: #fafafa;" class="hover:bg-transparent">
            <TableHead
              v-for="col in columns"
              :key="col.key"
              class="select-none cursor-pointer"
              style="padding: 11px 16px; font-size: 11px; font-weight: 500; color: #71717a; letter-spacing: 0.05em; text-transform: uppercase; height: auto;"
              @click="bike.toggleSort(col.key)"
            >
              <span style="display: inline-flex; align-items: center; gap: 4px;">
                {{ col.label }}
                <ChevronUp v-if="sortKey === col.key && sortDir === 'asc'" style="width: 13px; height: 13px;" />
                <ChevronDown v-else-if="sortKey === col.key && sortDir === 'desc'" style="width: 13px; height: 13px;" />
                <ChevronsUpDown v-else style="width: 13px; height: 13px; color: #d4d4d8;" />
              </span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow
            v-for="t in visibleTickets"
            :key="t.id"
            class="bk-row"
            :style="{ cursor: 'pointer', background: t.rowBg, borderBottom: '1px solid #f4f4f5' }"
            @click="bike.selectTicket(t.id)"
          >
            <TableCell style="padding: 14px 16px;">
              <div style="font-weight: 500; color: #18181b; margin-bottom: 2px;">{{ t.title }}</div>
              <div style="font-size: 12px; color: #a1a1aa; font-family: 'Courier New', monospace;">{{ t.id }}</div>
            </TableCell>
            <TableCell style="padding: 14px 16px;"><span :style="{ display: 'inline-flex', padding: '3px 9px', borderRadius: '99px', fontSize: '12px', fontWeight: 500, background: t.sBg, color: t.sColor }">{{ t.status }}</span></TableCell>
            <TableCell style="padding: 14px 16px;"><span style="display: inline-flex; padding: 3px 8px; border-radius: 5px; font-size: 12px; font-weight: 600; background: #f4f4f5; color: #71717a; font-family: 'Courier New', monospace;">{{ t.effort }}</span></TableCell>
            <TableCell style="padding: 14px 16px;"><span :style="{ display: 'inline-flex', padding: '3px 9px', borderRadius: '99px', fontSize: '12px', fontWeight: 500, background: t.pBg, color: t.pColor }">{{ t.priority }}</span></TableCell>
            <TableCell style="padding: 14px 16px; font-size: 13px; color: #71717a;">{{ t.hill }}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>

    <!-- Pipeline (kanban) view -->
    <div v-else style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; align-items: start;">
      <div v-for="col in pipeline" :key="col.status" style="background: #fafafa; border: 1px solid #e4e4e7; border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 10px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span :style="{ display: 'inline-flex', padding: '3px 9px', borderRadius: '99px', fontSize: '12px', fontWeight: 500, background: col.sBg, color: col.sColor }">{{ col.status }}</span>
          <span style="font-size: 12px; color: #a1a1aa; font-weight: 500;">{{ col.items.length }}</span>
        </div>

        <div
          v-for="t in col.items"
          :key="t.id"
          class="bk-pcard"
          style="background: white; border: 1px solid #e4e4e7; border-radius: 8px; padding: 14px; cursor: pointer; transition: box-shadow 0.15s, border-color 0.15s;"
          @click="bike.selectTicket(t.id)"
        >
          <div style="font-size: 14px; font-weight: 600; color: #18181b; line-height: 1.35; margin-bottom: 4px;">{{ t.title }}</div>
          <div style="font-size: 12px; color: #a1a1aa; font-family: 'Courier New', monospace; margin-bottom: 12px;">{{ t.id }}</div>
          <div style="display: flex; gap: 6px; flex-wrap: wrap; align-items: center;">
            <span style="display: inline-flex; padding: 3px 8px; border-radius: 5px; font-size: 12px; font-weight: 600; background: #f4f4f5; color: #71717a; font-family: 'Courier New', monospace;">{{ t.effort }}</span>
            <span :style="{ display: 'inline-flex', padding: '3px 9px', borderRadius: '99px', fontSize: '12px', fontWeight: 500, background: t.pBg, color: t.pColor }">{{ t.priority }}</span>
            <span style="margin-left: auto; font-size: 12px; color: #71717a;">{{ t.hill }}</span>
          </div>
        </div>

        <div v-if="!col.items.length" style="font-size: 13px; color: #a1a1aa; text-align: center; padding: 16px 0;">Aucun ticket</div>
      </div>
    </div>

    <!-- Ticket detail — shadcn Sheet (right panel) -->
    <Sheet v-model:open="open">
      <SheetContent class="w-full sm:max-w-md p-0 gap-0">
        <template v-if="ticketDetail">
          <SheetHeader style="padding: 16px 20px; border-bottom: 1px solid #f4f4f5;">
            <SheetTitle style="font-size: 14px; font-weight: 600; color: #18181b; line-height: 1.4; padding-right: 24px;">{{ ticketDetail.title }}</SheetTitle>
            <div style="font-size: 12px; color: #a1a1aa; font-family: 'Courier New', monospace;">{{ ticketDetail.id }}</div>
          </SheetHeader>

          <div style="padding: 12px 20px; display: flex; gap: 8px; flex-wrap: wrap; border-bottom: 1px solid #f4f4f5;">
            <span :style="{ display: 'inline-flex', padding: '3px 9px', borderRadius: '99px', fontSize: '12px', fontWeight: 500, background: ticketDetail.sBg, color: ticketDetail.sColor }">{{ ticketDetail.status }}</span>
            <span :style="{ display: 'inline-flex', padding: '3px 9px', borderRadius: '99px', fontSize: '12px', fontWeight: 500, background: ticketDetail.pBg, color: ticketDetail.pColor }">{{ ticketDetail.priority }}</span>
            <span style="display: inline-flex; padding: 3px 8px; border-radius: 5px; font-size: 12px; font-weight: 600; background: #f4f4f5; color: #71717a; font-family: 'Courier New', monospace;">{{ ticketDetail.effort }}</span>
          </div>

          <div style="padding: 12px 20px; display: flex; flex-direction: column; gap: 7px; border-bottom: 1px solid #f4f4f5;">
            <div style="display: flex; gap: 8px; font-size: 13px;"><span style="color: #a1a1aa; min-width: 68px;">Hill</span><span style="color: #18181b; font-weight: 500;">{{ ticketDetail.hill }}</span></div>
            <div style="display: flex; gap: 8px; font-size: 13px;"><span style="color: #a1a1aa; min-width: 68px;">Assigné à</span><span style="color: #18181b; font-weight: 500;">{{ ticketDetail.owner }}</span></div>
            <div style="display: flex; gap: 8px; font-size: 13px; align-items: center;"><span style="color: #a1a1aa; min-width: 68px;">PR GitHub</span><a href="#" style="color: #2563eb; font-weight: 500; font-size: 12px; text-decoration: none; font-family: 'Courier New', monospace;">{{ ticketDetail.pr }}</a></div>
          </div>

          <div style="padding: 16px 20px; overflow-y: auto; flex: 1;">
            <div style="font-size: 11px; font-weight: 500; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 14px;">Historique</div>
            <div v-for="(a, i) in ticketDetail.activity" :key="i" style="display: flex; gap: 12px; padding-bottom: 12px;">
              <div style="display: flex; flex-direction: column; align-items: center; flex-shrink: 0;">
                <div :style="{ width: '7px', height: '7px', borderRadius: '50%', background: a.dot, flexShrink: 0, marginTop: '4px' }" />
                <div style="width: 1px; flex: 1; background: #f4f4f5; margin-top: 4px;" />
              </div>
              <div style="flex: 1; min-width: 0; padding-bottom: 2px;">
                <div style="font-size: 13px; color: #18181b; line-height: 1.45; margin-bottom: 2px;">{{ a.text }}</div>
                <div style="font-size: 11px; color: #a1a1aa;">{{ a.time }}</div>
              </div>
            </div>
          </div>
        </template>
      </SheetContent>
    </Sheet>
  </div>
</template>

<style scoped>
.bk-row:hover { background: #fafafa !important; }
.bk-pcard:hover { border-color: #d4d4d8 !important; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
a:hover { text-decoration: underline !important; }
</style>
