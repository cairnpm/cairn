<script setup lang="ts">
import { computed, reactive, ref, watchEffect } from 'vue'
import { Check, Sparkles, Trash2, UserPlus } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'vue-sonner'

const { t } = useUiLang()

interface SettingsView { workspace_name: string; workspace_logo: string | null; has_key: boolean; key_source: string; model: string; models: string[]; code_repo: string; code_repo_source: string; has_code_token: boolean; github_app_ready: boolean; github_app_slug: string; github_connected: boolean }
interface Profile { id: string; name: string; email: string | null; role: string; avatar_url: string | null }
interface Member { id: string; name: string; email: string | null; role: string; avatar_url: string | null }

async function uploadImage(file: File): Promise<string | null> {
  const fd = new FormData()
  fd.append('file', file)
  const r = await $fetch<{ attachments: { id: string }[] }>('/api/uploads', { method: 'POST', body: fd })
  return r.attachments?.[0]?.id ?? null
}

const { data: cfg } = await useApiData<SettingsView>(qk.settings, '/api/settings')
const { data: profileData } = await useApiData<Profile>(qk.profile, '/api/profile')
const { data: members } = await useApiData<Member[]>(qk.members, '/api/members', { default: () => [] })
const { mutate } = useApiMutation()
const { fetch: refreshSession } = useUserSession()

const SECTIONS = [
  { key: 'profile', label: t('settings.tabs.profile') },
  { key: 'workspace', label: t('settings.tabs.workspace') },
  { key: 'ia', label: t('settings.tabs.ia') },
  { key: 'members', label: t('settings.tabs.members') },
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
    await mutate('/api/profile', { body: { name: profile.name.trim(), email: profile.email.trim(), avatar_url: avatarUrl.value ?? '' }, invalidates: [qk.profile, qk.members, qk.overview], success: t('settings.toast.profileSaved') })
    await refreshSession()
    profileSaved.value = true
  } finally { savingProfile.value = false }
}

// ── Mot de passe ────────────────────────────────────────────────────────
const pwd = reactive({ current: '', next: '' })
const changingPwd = ref(false)
async function changePassword() {
  if (changingPwd.value || !pwd.current || pwd.next.length < 8) return
  changingPwd.value = true
  try {
    await mutate('/api/profile/password', { body: { current: pwd.current, next: pwd.next }, success: t('settings.toast.passwordChanged') })
    pwd.current = ''; pwd.next = ''
  } catch { /* error toast shown by mutate */ } finally { changingPwd.value = false }
}

// ── Membres (admin owner) ───────────────────────────────────────────────
const isOwner = computed(() => profileData.value?.role === 'owner')
const invite = reactive({ email: '', role: 'member' as 'member' | 'owner' })
const inviting = ref(false)
const inviteUrl = ref('')
const inviteErr = ref('')
const copied = ref(false)
const inviteOpen = ref(false)
function openInvite() { invite.email = ''; invite.role = 'member'; inviteUrl.value = ''; inviteErr.value = ''; inviteOpen.value = true }
const invites = ref<Array<{ id: string; email: string; role: string; expires_at: string }>>([])
async function loadInvites() {
  try { invites.value = await $fetch('/api/members/invites') } catch { invites.value = [] }
}
watchEffect(() => { if (isOwner.value) loadInvites() })
async function sendInvite() {
  if (inviting.value || !invite.email.trim()) return
  inviting.value = true; inviteErr.value = ''; inviteUrl.value = ''
  try {
    // The generated link IS the confirmation → show it inline, no toast; errors stay inline in the modal.
    const r = await mutate<{ url: string }>('/api/members/invite', { body: { email: invite.email.trim(), role: invite.role }, errorToast: false })
    inviteUrl.value = r.url; invite.email = ''
    await loadInvites()
  } catch (e: unknown) { inviteErr.value = (e as { statusMessage?: string })?.statusMessage || t('settings.inviteFailed') } finally { inviting.value = false }
}
async function copyInvite() {
  try { await navigator.clipboard.writeText(inviteUrl.value); copied.value = true; toast.success(t('settings.toast.linkCopied')); setTimeout(() => copied.value = false, 1500) } catch { /* clipboard blocked */ }
}
async function revokeInvite(id: string) {
  try { await mutate(`/api/members/invites/${id}`, { method: 'DELETE', success: t('settings.toast.inviteRevoked') }); await loadInvites() } catch { /* toast shown */ }
}
async function setMemberRole(id: string, role: string) {
  try { await mutate(`/api/members/${id}/role`, { body: { role }, invalidates: [qk.members], success: t('settings.toast.roleUpdated') }) }
  catch { await invalidate(qk.members) } // revert the optimistic Select value
}
async function removeMember(m: Member) {
  if (!confirm(t('settings.removeConfirm', { name: m.name }))) return
  try { await mutate(`/api/members/${m.id}`, { method: 'DELETE', invalidates: [qk.members], success: t('settings.memberRemoved', { name: m.name }) }) } catch { /* toast shown */ }
}

// ── Workspace + IA ──────────────────────────────────────────────────────
const workspaceName = ref('')
const workspaceLogo = ref<string | null>(null)
const uploadingLogo = ref(false)
const keyInput = ref('')
const modelInput = ref('claude-sonnet-4-6')
watchEffect(() => { if (cfg.value) { workspaceName.value = cfg.value.workspace_name; workspaceLogo.value = cfg.value.workspace_logo; modelInput.value = cfg.value.model } })
// Product repo — the intake greps it (ground truth of what's built) to dedupe + ground specs. One
// button: grant read access via the Cairn GitHub App; the granted repo is auto-detected server-side.
async function connectGithub() {
  // Already installed? discover + clone server-side. Otherwise send to GitHub's grant screen.
  if (cfg.value?.github_app_ready) {
    const r = await $fetch<{ ok: boolean; repo?: string }>('/api/github/sync', { method: 'POST' }).catch(() => null)
    if (r?.ok) { await invalidate(qk.settings); toast.success(`Repo connecté · ${r.repo}`); return }
  }
  navigateTo('/api/github/install', { external: true })
}
onMounted(() => {
  const g = new URLSearchParams(window.location.search).get('github')
  if (g === 'connected') toast.success('Accès accordé — repo connecté.')
  else if (g === 'error') toast.error('Connexion GitHub échouée.')
})
async function onLogoFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  uploadingLogo.value = true
  try { workspaceLogo.value = await uploadImage(file) } finally { uploadingLogo.value = false }
}
const saving = ref(false)
const saved = ref(false)

const MODEL_META = computed<Record<string, { name: string; desc: string }>>(() => ({
  'claude-sonnet-4-6': { name: 'Sonnet 4.6', desc: t('settings.model.sonnetDesc') },
  'claude-opus-4-8': { name: 'Opus 4.8', desc: t('settings.model.opusDesc') },
}))
const models = computed(() => cfg.value?.models ?? Object.keys(MODEL_META.value))

async function save() {
  if (saving.value) return
  saving.value = true; saved.value = false
  try {
    await mutate('/api/settings', { body: {
      workspace_name: workspaceName.value.trim() || undefined,
      workspace_logo_id: workspaceLogo.value ?? '',
      anthropic_api_key: keyInput.value.trim() || undefined,
      anthropic_model: modelInput.value,
    }, invalidates: [qk.settings, qk.overview], success: t('settings.toast.settingsSaved') })
    keyInput.value = ''
    saved.value = true
  } finally { saving.value = false }
}
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden">
    <div class="mx-auto w-full max-w-5xl px-6 pt-8">
      <h1 class="text-lg font-semibold tracking-tight">{{ t('settings.title') }}</h1>
      <p class="text-sm text-muted-foreground">{{ t('settings.subtitle') }}</p>
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
            <h2 class="text-base font-medium">{{ t('settings.profile.heading') }}</h2>
            <p class="text-sm text-muted-foreground">{{ t('settings.profile.description') }}</p>
          </div>
          <Separator />
          <div class="flex items-center gap-4">
            <UserAvatar :name="profile.name" :src="avatarUrl" class="size-14 rounded-full text-lg" />
            <div class="flex flex-col items-start gap-1.5">
              <input id="avatarFile" type="file" accept="image/*" class="hidden" @change="onAvatarFile">
              <Button as-child variant="outline" size="sm" :disabled="uploadingAvatar">
                <label for="avatarFile" class="cursor-pointer">{{ uploadingAvatar ? t('settings.uploading') : t('settings.chooseImage') }}</label>
              </Button>
              <button v-if="avatarUrl" type="button" class="text-xs text-muted-foreground hover:text-foreground" @click="avatarUrl = null">{{ t('settings.remove') }}</button>
              <span v-else class="text-xs text-muted-foreground">{{ t('settings.avatarFallback') }}</span>
            </div>
          </div>
          <div class="grid gap-2 sm:max-w-sm">
            <Label for="name">{{ t('settings.fields.name') }}</Label>
            <Input id="name" v-model="profile.name" :placeholder="t('settings.fields.namePlaceholder')" />
          </div>
          <div class="grid gap-2 sm:max-w-sm">
            <Label for="email">{{ t('settings.fields.email') }}</Label>
            <Input id="email" v-model="profile.email" type="email" :placeholder="t('settings.fields.emailPlaceholder')" />
          </div>
          <div class="flex items-center justify-end gap-3">
            <span v-if="profileSaved" class="text-sm text-muted-foreground">✓ {{ t('settings.toast.profileSaved') }}</span>
            <Button variant="outline" :disabled="savingProfile || !profile.name.trim()" @click="saveProfile">{{ savingProfile ? t('settings.saving') : t('settings.saveProfile') }}</Button>
          </div>

          <Separator />
          <div>
            <h3 class="text-sm font-medium">{{ t('settings.password.heading') }}</h3>
            <p class="text-sm text-muted-foreground">{{ t('settings.password.hint') }}</p>
          </div>
          <div class="grid gap-2 sm:max-w-sm">
            <Label for="curpwd">{{ t('settings.password.current') }}</Label>
            <Input id="curpwd" v-model="pwd.current" type="password" autocomplete="current-password" />
          </div>
          <div class="grid gap-2 sm:max-w-sm">
            <Label for="newpwd">{{ t('settings.password.new') }}</Label>
            <Input id="newpwd" v-model="pwd.next" type="password" autocomplete="new-password" />
          </div>
          <div class="flex items-center justify-end gap-3">
            <Button variant="outline" :disabled="changingPwd || !pwd.current || pwd.next.length < 8" @click="changePassword">{{ changingPwd ? t('settings.password.changing') : t('settings.password.change') }}</Button>
          </div>
        </section>

        <!-- Workspace -->
        <section v-show="active === 'workspace'" class="flex max-w-xl flex-col gap-5">
          <div>
            <h2 class="text-base font-medium">{{ t('settings.workspace.heading') }}</h2>
            <p class="text-sm text-muted-foreground">{{ t('settings.workspace.description') }}</p>
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
                <label for="logoFile" class="cursor-pointer">{{ uploadingLogo ? t('settings.uploading') : t('settings.chooseImage') }}</label>
              </Button>
              <button v-if="workspaceLogo" type="button" class="text-xs text-muted-foreground hover:text-foreground" @click="workspaceLogo = null">{{ t('settings.remove') }}</button>
            </div>
          </div>
          <div class="grid gap-2 sm:max-w-sm">
            <Label for="ws">{{ t('settings.workspace.nameLabel') }}</Label>
            <Input id="ws" v-model="workspaceName" placeholder="Cairn" />
          </div>
          <div class="flex items-center justify-end gap-3">
            <span v-if="saved" class="text-sm text-muted-foreground">✓ {{ t('settings.saved') }}</span>
            <Button :disabled="saving" @click="save">{{ saving ? t('settings.saving') : t('settings.save') }}</Button>
          </div>
        </section>

        <!-- IA -->
        <section v-show="active === 'ia'" class="flex max-w-xl flex-col gap-5">
          <div class="flex items-start justify-between gap-3">
            <div>
              <h2 class="text-base font-medium">{{ t('settings.ia.heading') }}</h2>
              <p class="text-sm text-muted-foreground">{{ t('settings.ia.description') }}</p>
            </div>
            <Badge :variant="cfg?.has_key ? 'default' : 'destructive'">{{ cfg?.has_key ? t('settings.ia.keyOk') : t('settings.ia.keyMissing') }}</Badge>
          </div>
          <Separator />
          <div class="grid gap-2 sm:max-w-sm">
            <Label for="key">{{ t('settings.ia.keyLabel') }}</Label>
            <Input id="key" v-model="keyInput" type="password" placeholder="sk-ant-…" autocomplete="off" class="font-mono" />
            <p class="text-xs text-muted-foreground">{{ cfg?.key_source === 'env' ? t('settings.ia.keyFromEnv') : cfg?.key_source === 'settings' ? t('settings.ia.keyFromSettings') : t('settings.ia.keyNone') }} {{ t('settings.ia.keyNeverShown') }}</p>
          </div>
          <div class="grid gap-2">
            <Label>{{ t('settings.ia.modelLabel') }}</Label>
            <div class="grid gap-2 sm:grid-cols-2">
              <button v-for="m in models" :key="m" type="button" class="flex flex-col items-start gap-0.5 rounded-lg border p-3 text-left transition-colors hover:bg-accent" :class="modelInput === m ? 'border-primary ring-1 ring-primary' : ''" @click="modelInput = m">
                <div class="flex w-full items-center justify-between"><span class="text-sm font-medium">{{ MODEL_META[m]?.name || m }}</span><Check v-if="modelInput === m" class="size-4" /></div>
                <span class="text-xs text-muted-foreground">{{ MODEL_META[m]?.desc || '' }}</span>
              </button>
            </div>
          </div>
          <div class="grid gap-2">
            <Label>Repo produit · intake code-aware</Label>
            <div class="rounded-lg border p-4">
              <template v-if="cfg?.github_connected && cfg?.code_repo">
                <div class="flex items-center justify-between gap-3">
                  <div class="min-w-0">
                    <div class="flex items-center gap-1.5 text-sm font-medium"><Check class="size-4 text-emerald-500" /> Connecté</div>
                    <div class="truncate font-mono text-xs text-muted-foreground">{{ cfg.code_repo }}</div>
                  </div>
                  <Button variant="outline" size="sm" @click="connectGithub">Changer de repo</Button>
                </div>
              </template>
              <template v-else>
                <p class="mb-3 text-sm text-muted-foreground">Donne à Cairn un accès <strong>lecture seule</strong> à ton repo GitHub — il s'en sert pour dédupliquer et ancrer les specs (jamais d'écriture).</p>
                <Button :disabled="!cfg?.github_app_ready" @click="connectGithub">Grant access</Button>
                <p v-if="!cfg?.github_app_ready" class="mt-2 text-xs text-muted-foreground">GitHub App non configurée sur cette instance.</p>
              </template>
            </div>
          </div>
          <div class="flex items-center justify-end gap-3">
            <span v-if="saved" class="text-sm text-muted-foreground">✓ {{ t('settings.saved') }}</span>
            <Button :disabled="saving" @click="save">{{ saving ? t('settings.saving') : t('settings.save') }}</Button>
          </div>
        </section>

        <!-- Membres -->
        <section v-show="active === 'members'" class="flex max-w-xl flex-col gap-5">
          <div class="flex items-start justify-between gap-3">
            <div>
              <h2 class="text-base font-medium">{{ t('settings.members.heading') }}</h2>
              <p class="text-sm text-muted-foreground">{{ isOwner ? t('settings.members.ownerDescription') : t('settings.members.memberDescription') }}</p>
            </div>
            <Button v-if="isOwner" size="sm" @click="openInvite"><UserPlus class="size-4" /> {{ t('settings.invite') }}</Button>
          </div>
          <Separator />

          <!-- Invite dialog -->
          <Dialog v-if="isOwner" v-model:open="inviteOpen">
            <DialogContent class="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{{ t('settings.invite') }}</DialogTitle>
                <DialogDescription>{{ inviteUrl ? t('settings.inviteDialog.linkReady') : t('settings.inviteDialog.prompt') }}</DialogDescription>
              </DialogHeader>

              <div v-if="!inviteUrl" class="flex flex-col gap-4 py-2">
                <div class="grid gap-2">
                  <Label for="inviteEmail">{{ t('settings.fields.email') }}</Label>
                  <Input id="inviteEmail" v-model="invite.email" type="email" :placeholder="t('settings.inviteDialog.emailPlaceholder')" @keydown.enter="sendInvite" />
                </div>
                <div class="grid gap-2">
                  <Label>{{ t('settings.fields.role') }}</Label>
                  <Select v-model="invite.role">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">{{ t('settings.role.member') }}</SelectItem>
                      <SelectItem value="owner">Owner</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p v-if="inviteErr" class="text-sm text-destructive">{{ inviteErr }}</p>
              </div>

              <div v-else class="flex items-center gap-2 rounded-md bg-muted p-2">
                <code class="min-w-0 flex-1 truncate text-xs">{{ inviteUrl }}</code>
                <Button variant="outline" size="sm" @click="copyInvite">{{ copied ? '✓ ' + t('settings.copied') : t('settings.copy') }}</Button>
              </div>

              <DialogFooter :class="inviteUrl ? 'sm:justify-between' : ''">
                <template v-if="!inviteUrl">
                  <Button :disabled="inviting || !invite.email.trim()" @click="sendInvite">{{ inviting ? t('settings.inviteDialog.generating') : t('settings.inviteDialog.generate') }}</Button>
                </template>
                <template v-else>
                  <Button variant="ghost" @click="openInvite">{{ t('settings.inviteDialog.inviteAnother') }}</Button>
                  <Button @click="inviteOpen = false">{{ t('settings.done') }}</Button>
                </template>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <!-- Pending invites -->
          <div v-if="isOwner && invites.length" class="flex flex-col gap-1">
            <div class="text-xs font-medium uppercase tracking-wide text-muted-foreground">{{ t('settings.members.pending', { count: invites.length }) }}</div>
            <div v-for="i in invites" :key="i.id" class="flex items-center gap-3 py-1.5">
              <div class="min-w-0 flex-1 truncate text-sm text-muted-foreground">{{ i.email }}</div>
              <Badge variant="secondary" class="capitalize">{{ i.role === 'owner' ? 'Owner' : t('settings.role.member') }}</Badge>
              <button type="button" class="text-xs text-muted-foreground hover:text-destructive" @click="revokeInvite(i.id)">{{ t('settings.revoke') }}</button>
            </div>
          </div>

          <!-- Active members -->
          <div class="flex flex-col gap-1">
            <div class="text-xs font-medium uppercase tracking-wide text-muted-foreground">{{ t('settings.members.team', { count: members.length }) }}</div>
            <div v-for="m in members" :key="m.id" class="flex items-center gap-3 py-2">
              <UserAvatar :name="m.name" :src="m.avatar_url" class="size-8 rounded-full" />
              <div class="min-w-0 flex-1">
                <div class="text-sm font-medium">{{ m.name }}{{ m.id === profileData?.id ? ' ' + t('settings.members.you') : '' }}</div>
                <div class="truncate text-xs text-muted-foreground">{{ m.email || '—' }}</div>
              </div>
              <template v-if="isOwner && m.id !== profileData?.id">
                <Select :model-value="m.role" @update:model-value="(v) => setMemberRole(m.id, v as string)">
                  <SelectTrigger class="h-8 w-[120px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">{{ t('settings.role.member') }}</SelectItem>
                    <SelectItem value="owner">Owner</SelectItem>
                  </SelectContent>
                </Select>
                <button type="button" class="text-muted-foreground transition-colors hover:text-destructive" :title="t('settings.removeMember')" @click="removeMember(m)"><Trash2 class="size-4" /></button>
              </template>
              <Badge v-else :variant="m.role === 'owner' ? 'default' : 'secondary'" class="capitalize">{{ m.role === 'owner' ? 'Owner' : t('settings.role.member') }}</Badge>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
