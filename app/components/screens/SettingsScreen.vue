<script setup lang="ts">
import { computed, reactive, ref, watchEffect } from 'vue'
import { Check, Sparkles } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'

interface SettingsView { workspace_name: string; workspace_logo: string | null; has_key: boolean; key_source: string; model: string; models: string[] }
interface Profile { id: string; name: string; email: string | null; role: string; avatar_url: string | null }
interface Member { id: string; name: string; email: string | null; role: string; avatar_url: string | null }

async function uploadImage(file: File): Promise<string | null> {
  const fd = new FormData()
  fd.append('file', file)
  const r = await $fetch<{ attachments: { id: string }[] }>('/api/uploads', { method: 'POST', body: fd })
  return r.attachments?.[0]?.id ?? null
}

const { data: cfg, refresh } = await useFetch<SettingsView>('/api/settings', { getCachedData: getFreshData })
const { data: profileData, refresh: refreshProfile } = await useFetch<Profile>('/api/profile', { getCachedData: getFreshData })
const { data: members } = await useFetch<Member[]>('/api/members', { default: () => [], getCachedData: getFreshData })
const { fetch: refreshSession } = useUserSession()

const SECTIONS = [
  { key: 'profile', label: 'Profil' },
  { key: 'workspace', label: 'Workspace' },
  { key: 'ia', label: 'Intelligence' },
  { key: 'prefs', label: 'Préférences' },
  { key: 'members', label: 'Membres' },
] as const
const active = ref<typeof SECTIONS[number]['key']>('profile')

// ── Profil ──────────────────────────────────────────────────────────────
const profile = reactive({ name: '', email: '' })
const avatarUrl = ref<string | null>(null)
const uploadingAvatar = ref(false)
watchEffect(() => { if (profileData.value) { profile.name = profileData.value.name; profile.email = profileData.value.email ?? ''; avatarUrl.value = profileData.value.avatar_url } })
const savingProfile = ref(false)
const profileSaved = ref(false)
async function onAvatarFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  uploadingAvatar.value = true
  try { avatarUrl.value = await uploadImage(file) } finally { uploadingAvatar.value = false }
}
async function saveProfile() {
  if (savingProfile.value || !profile.name.trim()) return
  savingProfile.value = true; profileSaved.value = false
  try {
    await $fetch('/api/profile', { method: 'POST', body: { name: profile.name.trim(), email: profile.email.trim(), avatar_url: avatarUrl.value ?? '' } })
    await Promise.all([refreshProfile(), refreshSession()])
    profileSaved.value = true
  } finally { savingProfile.value = false }
}

// ── Workspace + IA ──────────────────────────────────────────────────────
const workspaceName = ref('')
const workspaceLogo = ref<string | null>(null)
const uploadingLogo = ref(false)
const keyInput = ref('')
const modelInput = ref('claude-haiku-4-5')
watchEffect(() => { if (cfg.value) { workspaceName.value = cfg.value.workspace_name; workspaceLogo.value = cfg.value.workspace_logo; modelInput.value = cfg.value.model } })
async function onLogoFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  uploadingLogo.value = true
  try { workspaceLogo.value = await uploadImage(file) } finally { uploadingLogo.value = false }
}
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
    await $fetch('/api/settings', { method: 'POST', body: {
      workspace_name: workspaceName.value.trim() || undefined,
      workspace_logo_id: workspaceLogo.value ?? '',
      anthropic_api_key: keyInput.value.trim() || undefined,
      anthropic_model: modelInput.value,
    } })
    keyInput.value = ''
    await refresh()
    saved.value = true
  } finally { saving.value = false }
}
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden">
    <div class="mx-auto w-full max-w-5xl px-6 pt-8">
      <h1 class="text-lg font-semibold tracking-tight">Réglages</h1>
      <p class="text-sm text-muted-foreground">Profil, workspace et configuration de l'agent.</p>
      <Separator class="mt-6" />
    </div>

    <div class="mx-auto flex w-full min-h-0 max-w-5xl flex-1 gap-10 px-6 py-6">
      <!-- Left nav -->
      <nav class="flex w-44 shrink-0 flex-col gap-1">
        <button
          v-for="s in SECTIONS" :key="s.key"
          class="rounded-md px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-muted"
          :class="active === s.key ? 'bg-muted text-foreground' : 'text-muted-foreground'"
          @click="active = s.key"
        >{{ s.label }}</button>
      </nav>

      <!-- Content -->
      <div class="min-w-0 flex-1 overflow-auto">
        <!-- Profil -->
        <section v-show="active === 'profile'" class="flex max-w-xl flex-col gap-5">
          <div>
            <h2 class="text-base font-medium">Profil</h2>
            <p class="text-sm text-muted-foreground">Votre identité dans le workspace (utilisée pour l'attribution).</p>
          </div>
          <Separator />
          <div class="flex items-center gap-4">
            <UserAvatar :name="profile.name" :src="avatarUrl" class="size-14 rounded-full text-lg" />
            <div class="flex flex-col items-start gap-1.5">
              <input id="avatarFile" type="file" accept="image/*" class="hidden" @change="onAvatarFile">
              <Button as-child variant="outline" size="sm" :disabled="uploadingAvatar">
                <label for="avatarFile" class="cursor-pointer">{{ uploadingAvatar ? 'Chargement…' : 'Choisir une image' }}</label>
              </Button>
              <button v-if="avatarUrl" type="button" class="text-xs text-muted-foreground hover:text-foreground" @click="avatarUrl = null">Retirer</button>
              <span v-else class="text-xs text-muted-foreground">Sinon, l'initiale du nom est utilisée.</span>
            </div>
          </div>
          <div class="grid gap-2 sm:max-w-sm">
            <Label for="name">Nom</Label>
            <Input id="name" v-model="profile.name" placeholder="Votre nom" />
          </div>
          <div class="grid gap-2 sm:max-w-sm">
            <Label for="email">Email</Label>
            <Input id="email" v-model="profile.email" type="email" placeholder="vous@exemple.com" />
          </div>
          <div class="flex items-center justify-end gap-3">
            <span v-if="profileSaved" class="text-sm text-muted-foreground">✓ Profil enregistré</span>
            <Button variant="outline" :disabled="savingProfile || !profile.name.trim()" @click="saveProfile">{{ savingProfile ? 'Enregistrement…' : 'Enregistrer le profil' }}</Button>
          </div>
        </section>

        <!-- Workspace -->
        <section v-show="active === 'workspace'" class="flex max-w-xl flex-col gap-5">
          <div>
            <h2 class="text-base font-medium">Workspace</h2>
            <p class="text-sm text-muted-foreground">Le nom affiché dans la barre latérale.</p>
          </div>
          <Separator />
          <div class="flex items-center gap-4">
            <div class="flex size-14 items-center justify-center overflow-hidden rounded-lg border bg-muted">
              <img v-if="workspaceLogo" :src="`/api/attachments/${workspaceLogo}`" class="size-full object-cover" alt="">
              <Sparkles v-else class="size-5 text-muted-foreground" />
            </div>
            <div class="flex flex-col items-start gap-1.5">
              <input id="logoFile" type="file" accept="image/*" class="hidden" @change="onLogoFile">
              <Button as-child variant="outline" size="sm" :disabled="uploadingLogo">
                <label for="logoFile" class="cursor-pointer">{{ uploadingLogo ? 'Chargement…' : 'Choisir une image' }}</label>
              </Button>
              <button v-if="workspaceLogo" type="button" class="text-xs text-muted-foreground hover:text-foreground" @click="workspaceLogo = null">Retirer</button>
            </div>
          </div>
          <div class="grid gap-2 sm:max-w-sm">
            <Label for="ws">Nom du workspace</Label>
            <Input id="ws" v-model="workspaceName" placeholder="Bicycle" />
          </div>
          <div class="flex items-center justify-end gap-3">
            <span v-if="saved" class="text-sm text-muted-foreground">✓ Enregistré</span>
            <Button :disabled="saving" @click="save">{{ saving ? 'Enregistrement…' : 'Enregistrer' }}</Button>
          </div>
        </section>

        <!-- IA -->
        <section v-show="active === 'ia'" class="flex max-w-xl flex-col gap-5">
          <div class="flex items-start justify-between gap-3">
            <div>
              <h2 class="text-base font-medium">Intelligence (Intake)</h2>
              <p class="text-sm text-muted-foreground">Clé API et modèle utilisés par l'agent.</p>
            </div>
            <Badge :variant="cfg?.has_key ? 'default' : 'destructive'">{{ cfg?.has_key ? 'Opérationnelle' : 'Absente' }}</Badge>
          </div>
          <Separator />
          <div class="grid gap-2 sm:max-w-sm">
            <Label for="key">Clé API Anthropic</Label>
            <Input id="key" v-model="keyInput" type="password" placeholder="sk-ant-…" autocomplete="off" class="font-mono" />
            <p class="text-xs text-muted-foreground">{{ cfg?.key_source === 'env' ? 'Héritée de l\'environnement.' : cfg?.key_source === 'settings' ? 'Définie ici.' : 'Aucune clé.' }} Jamais réaffichée ; saisissez-en une nouvelle pour la remplacer.</p>
          </div>
          <div class="grid gap-2">
            <Label>Modèle</Label>
            <div class="grid gap-2 sm:grid-cols-3">
              <button v-for="m in models" :key="m" type="button" class="flex flex-col items-start gap-0.5 rounded-lg border p-3 text-left transition-colors hover:bg-accent" :class="modelInput === m ? 'border-primary ring-1 ring-primary' : ''" @click="modelInput = m">
                <div class="flex w-full items-center justify-between"><span class="text-sm font-medium">{{ MODEL_META[m]?.name || m }}</span><Check v-if="modelInput === m" class="size-4" /></div>
                <span class="text-xs text-muted-foreground">{{ MODEL_META[m]?.desc || '' }}</span>
              </button>
            </div>
          </div>
          <div class="flex items-center justify-end gap-3">
            <span v-if="saved" class="text-sm text-muted-foreground">✓ Enregistré</span>
            <Button :disabled="saving" @click="save">{{ saving ? 'Enregistrement…' : 'Enregistrer' }}</Button>
          </div>
        </section>

        <!-- Préférences -->
        <section v-show="active === 'prefs'" class="flex max-w-xl flex-col gap-5">
          <div>
            <h2 class="text-base font-medium">Préférences</h2>
            <p class="text-sm text-muted-foreground">Comportement global du Product OS.</p>
          </div>
          <Separator />
          <div class="flex flex-col">
            <div v-for="(p, i) in [{ k: 'dedup', t: 'Détection de doublons', d: 'Avant écriture en base' }, { k: 'confirm', t: 'Confirmation avant routing', d: 'Requise pour création de feature' }, { k: 'slack', t: 'Notifications Slack', d: 'À chaque hill créé/clôturé' }]" :key="p.k">
              <Separator v-if="i > 0" class="my-1" />
              <div class="flex items-center justify-between py-2.5">
                <div><div class="text-sm font-medium">{{ p.t }}</div><div class="text-xs text-muted-foreground">{{ p.d }}</div></div>
                <Switch v-model="prefs[p.k as keyof typeof prefs.value]" />
              </div>
            </div>
          </div>
        </section>

        <!-- Membres -->
        <section v-show="active === 'members'" class="flex max-w-xl flex-col gap-5">
          <div>
            <h2 class="text-base font-medium">Membres</h2>
            <p class="text-sm text-muted-foreground">L'équipe du workspace.</p>
          </div>
          <Separator />
          <div class="flex flex-col gap-1">
            <div v-for="m in members" :key="m.id" class="flex items-center gap-3 py-2">
              <UserAvatar :name="m.name" :src="m.avatar_url" class="size-8 rounded-full" />
              <div class="min-w-0 flex-1">
                <div class="text-sm font-medium">{{ m.name }}</div>
                <div class="truncate text-xs text-muted-foreground">{{ m.email || '—' }}</div>
              </div>
              <Badge :variant="m.role === 'owner' ? 'default' : 'secondary'" class="capitalize">{{ m.role }}</Badge>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
