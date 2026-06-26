<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check, Users } from 'lucide-vue-next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'

interface SettingsView { has_key: boolean; key_source: string; model: string; models: string[] }
const { data: cfg, refresh } = await useFetch<SettingsView>('/api/settings', { getCachedData: getFreshData })

const keyInput = ref('')
const modelInput = ref(cfg.value?.model ?? 'claude-haiku-4-5')
const saving = ref(false)
const saved = ref(false)
const prefs = ref({ dedup: true, confirm: true, slack: false })

const MODEL_META: Record<string, { name: string; desc: string }> = {
  'claude-haiku-4-5': { name: 'Haiku 4.5', desc: 'Rapide · ~1.2s' },
  'claude-sonnet-4-6': { name: 'Sonnet 4.6', desc: 'Équilibré · ~2.8s' },
  'claude-opus-4-8': { name: 'Opus 4.8', desc: 'Profond · ~6.5s' },
}
const models = computed(() => cfg.value?.models ?? Object.keys(MODEL_META))

async function save() {
  if (saving.value) return
  saving.value = true; saved.value = false
  try {
    await $fetch('/api/settings', { method: 'POST', body: { anthropic_api_key: keyInput.value.trim() || undefined, anthropic_model: modelInput.value } })
    keyInput.value = ''
    await refresh()
    modelInput.value = cfg.value?.model ?? modelInput.value
    saved.value = true
  } finally { saving.value = false }
}
</script>

<template>
  <div class="h-full overflow-auto p-4">
    <div class="mx-auto max-w-2xl">
      <Tabs default-value="general">
        <TabsList>
          <TabsTrigger value="general">Général</TabsTrigger>
          <TabsTrigger value="members">Membres</TabsTrigger>
        </TabsList>

        <TabsContent value="general" class="mt-4 flex flex-col gap-4">
          <Card>
            <CardHeader>
              <div class="flex items-center justify-between">
                <div>
                  <CardTitle>Configuration IA</CardTitle>
                  <CardDescription>Clé API et modèle utilisés par l'Intake</CardDescription>
                </div>
                <Badge :variant="cfg?.has_key ? 'default' : 'destructive'">{{ cfg?.has_key ? 'Opérationnelle' : 'Absente' }}</Badge>
              </div>
            </CardHeader>
            <CardContent class="flex flex-col gap-5">
              <div class="grid gap-2">
                <Label for="key">Clé API Anthropic</Label>
                <Input id="key" v-model="keyInput" type="password" placeholder="sk-ant-…" autocomplete="off" class="font-mono" />
                <p class="text-xs text-muted-foreground">{{ cfg?.key_source === 'env' ? 'Héritée de l\'environnement.' : 'Définie ici.' }} Jamais réaffichée ; saisissez-en une nouvelle pour la remplacer.</p>
              </div>
              <div class="grid gap-2">
                <Label>Modèle</Label>
                <div class="grid grid-cols-3 gap-2">
                  <button v-for="m in models" :key="m" type="button" class="flex flex-col items-start gap-0.5 rounded-lg border p-3 text-left transition-colors hover:bg-accent" :class="modelInput === m ? 'border-primary ring-1 ring-primary' : ''" @click="modelInput = m">
                    <div class="flex w-full items-center justify-between"><span class="text-sm font-medium">{{ MODEL_META[m]?.name || m }}</span><Check v-if="modelInput === m" class="size-4" /></div>
                    <span class="text-xs text-muted-foreground">{{ MODEL_META[m]?.desc || '' }}</span>
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Préférences workspace</CardTitle>
              <CardDescription>Réglages globaux du Product OS</CardDescription>
            </CardHeader>
            <CardContent class="flex flex-col">
              <div v-for="(p, i) in [{ k: 'dedup', t: 'Détection de doublons', d: 'Avant écriture en base' }, { k: 'confirm', t: 'Confirmation avant routing', d: 'Requise pour création de feature' }, { k: 'slack', t: 'Notifications Slack', d: 'À chaque hill créé/clôturé' }]" :key="p.k">
                <Separator v-if="i > 0" class="my-1" />
                <div class="flex items-center justify-between py-2.5">
                  <div><div class="text-sm font-medium">{{ p.t }}</div><div class="text-xs text-muted-foreground">{{ p.d }}</div></div>
                  <Switch v-model="prefs[p.k as keyof typeof prefs.value]" />
                </div>
              </div>
            </CardContent>
          </Card>

          <div class="flex items-center justify-end gap-3">
            <span v-if="saved" class="text-sm text-muted-foreground">✓ Enregistré</span>
            <Button :disabled="saving" @click="save">{{ saving ? 'Enregistrement…' : 'Enregistrer' }}</Button>
          </div>
        </TabsContent>

        <TabsContent value="members" class="mt-4">
          <Card>
            <CardContent class="flex flex-col items-center gap-3 py-10 text-center">
              <div class="flex size-10 items-center justify-center rounded-lg bg-muted"><Users class="size-5 text-muted-foreground" /></div>
              <div>
                <div class="text-sm font-medium">Gestion des membres</div>
                <p class="text-sm text-muted-foreground">CEO · Alex · Sam sont seedés. L'écran de gestion arrive bientôt.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  </div>
</template>
