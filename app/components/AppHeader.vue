<script setup lang="ts">
const bike = useBicycle()
const { screen, pageMeta, ticketCount, selectedHill } = bike

const btnDark = 'padding: 7px 14px; background: #18181b; color: white; border: none; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer; font-family: inherit;'
const btnLight = 'padding: 7px 14px; background: white; color: #18181b; border: 1px solid #e4e4e7; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer; font-family: inherit;'
</script>

<template>
  <header style="height: 56px; background: white; border-bottom: 1px solid #e4e4e7; padding: 0 24px; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-shrink: 0;">
    <div>
      <div style="font-size: 15px; font-weight: 600; color: #18181b;">{{ pageMeta.title }}</div>
      <div style="font-size: 12px; color: #71717a; margin-top: 1px;">{{ pageMeta.sub }}</div>
    </div>

    <div style="display: flex; gap: 8px; align-items: center; flex-shrink: 0;">
      <!-- Intake -->
      <span v-if="screen === 'intake'" style="font-size: 12px; color: #71717a; background: #f4f4f5; padding: 4px 12px; border-radius: 99px; font-weight: 500;">{{ ticketCount }} tickets</span>

      <!-- Backlog -->
      <button v-if="screen === 'backlog'" :style="btnDark" @click="bike.goTo('intake')">+ Nouveau ticket</button>

      <!-- Betting -->
      <template v-if="screen === 'betting'">
        <div style="display: flex; align-items: center; gap: 6px; font-size: 13px; color: #71717a; padding: 4px 10px; background: #f4f4f5; border-radius: 99px;">
          <div style="width: 20px; height: 20px; border-radius: 50%; background: #18181b; color: white; display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 700;">C</div>
          CEO
        </div>
        <button :style="btnLight">↻ Regénérer</button>
        <button :style="btnDark">Confirmer →</button>
      </template>

      <!-- Hills (detail only) -->
      <template v-if="screen === 'hills' && selectedHill !== null">
        <button :style="btnLight" @click="bike.clearHill()">← Toutes les Hills</button>
        <button :style="btnDark" @click="bike.goTo('betting')">Ouvrir Betting →</button>
      </template>
    </div>
  </header>
</template>
