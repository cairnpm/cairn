<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

const bike = useBicycle()
const { input, msgs, chatMsgs } = bike

const chatEl = ref<HTMLElement | null>(null)

watch(() => msgs.value.length, async () => {
  await nextTick()
  if (chatEl.value) chatEl.value.scrollTop = chatEl.value.scrollHeight
})

function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); bike.send() }
}

const suggestions = [
  'Les utilisateurs se plaignent que l\'export PDF est très lent (~30s)',
  'Intégration Slack pour les notifications de changement de statut',
  'Bug critique : crash de l\'app sur export en batch avec +50 fichiers',
  'Redesign de la page onboarding pour améliorer le taux de conversion',
]
const chips = ['Export PDF lent', 'Intégration Slack', 'Bug critique prod', 'Nouvelle feature onboarding']
</script>

<template>
  <div style="height: 100%; display: flex; flex-direction: column; background: white;">
    <!-- Empty / welcome -->
    <div v-if="msgs.length === 0" style="flex: 1; display: flex; align-items: center; justify-content: center; padding: 40px 32px;">
      <div style="width: 100%; max-width: 600px; display: flex; flex-direction: column; align-items: center; gap: 32px;">
        <div style="display: flex; flex-direction: column; align-items: center; gap: 16px;">
          <div style="width: 56px; height: 56px; background: #18181b; border-radius: 14px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 16px rgba(0,0,0,0.15);">
            <span style="color: white; font-size: 26px; font-weight: 800; letter-spacing: -1px;">B</span>
          </div>
          <div style="text-align: center;">
            <div style="font-size: 26px; font-weight: 700; color: #18181b; margin-bottom: 10px; letter-spacing: -0.5px;">Comment puis-je vous aider ?</div>
            <div style="font-size: 15px; color: #71717a; line-height: 1.65; max-width: 460px;">Décrivez une feature, un bug ou une urgence.<br>Je détecte les doublons et maintiens votre backlog propre.</div>
          </div>
        </div>

        <div style="width: 100%; border: 1.5px solid #e4e4e7; border-radius: 14px; background: white; overflow: hidden; box-shadow: 0 2px 16px rgba(0,0,0,0.06);">
          <textarea
            v-model="input"
            placeholder="Ex: les utilisateurs se plaignent que l'export PDF est très lent..."
            style="width: 100%; min-height: 108px; padding: 18px 18px 10px; border: none; font-family: inherit; font-size: 15px; color: #18181b; resize: none; line-height: 1.65; background: transparent;"
            @keydown="onKey"
          />
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; border-top: 1px solid #f4f4f5; background: #fafafa;">
            <span style="font-size: 12px; color: #a1a1aa;">Shift+Entrée pour une nouvelle ligne</span>
            <button class="bk-dark" style="padding: 8px 20px; background: #18181b; color: white; border: none; border-radius: 7px; font-size: 14px; font-weight: 500; cursor: pointer; font-family: inherit;" @click="bike.send()">Envoyer ↑</button>
          </div>
        </div>

        <div style="display: flex; gap: 8px; flex-wrap: wrap; justify-content: center;">
          <button
            v-for="(chip, i) in chips"
            :key="chip"
            class="bk-chip"
            style="padding: 7px 16px; border: 1px solid #e4e4e7; background: white; color: #71717a; border-radius: 99px; font-size: 13px; cursor: pointer; font-family: inherit;"
            @click="bike.setInput(suggestions[i])"
          >{{ chip }}</button>
        </div>
      </div>
    </div>

    <!-- Chat -->
    <template v-else>
      <div ref="chatEl" style="flex: 1; overflow-y: auto; padding: 32px; display: flex; flex-direction: column; gap: 20px;">
        <div
          v-for="m in chatMsgs"
          :key="m.id"
          :style="{ display: 'flex', gap: '10px', justifyContent: m.justify, alignItems: 'flex-end', maxWidth: '720px', width: '100%', margin: '0 auto', boxSizing: 'border-box' }"
        >
          <div v-if="m.isAgent" style="width: 28px; height: 28px; background: #18181b; border-radius: 7px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
            <span style="color: white; font-size: 11px; font-weight: 700;">B</span>
          </div>
          <div :style="{ maxWidth: '72%', padding: '12px 16px', fontSize: '14px', lineHeight: '1.65', background: m.bg, color: m.fg, borderRadius: m.radius, whiteSpace: 'pre-wrap' }">{{ m.text }}</div>
        </div>
      </div>
      <div style="border-top: 1px solid #e4e4e7; padding: 16px 32px; background: white; flex-shrink: 0;">
        <div style="max-width: 720px; margin: 0 auto; display: flex; gap: 8px;">
          <input
            v-model="input"
            type="text"
            placeholder="Décris une feature, un bug, une urgence produit..."
            style="flex: 1; padding: 11px 16px; border: 1.5px solid #e4e4e7; border-radius: 8px; font-size: 14px; font-family: inherit; color: #18181b; background: white;"
            @keydown="onKey"
          >
          <button class="bk-dark" style="width: 44px; height: 44px; background: #18181b; color: white; border: none; border-radius: 8px; font-size: 20px; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0;" @click="bike.send()">↑</button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.bk-dark:hover { background: #27272a !important; }
.bk-chip:hover { border-color: #18181b !important; color: #18181b !important; }
</style>
