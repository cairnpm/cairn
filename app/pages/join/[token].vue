<script setup lang="ts">
import { ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

definePageMeta({ layout: false })

const route = useRoute()
const token = route.params.token as string
const { fetch: refreshSession } = useUserSession()

// Validate the token up front so an invalid/expired link shows a clear message (not a form).
const { data: invite, error: inviteError } = await useAsyncData(`invite-${token}`, () =>
  $fetch<{ email: string; role: string; workspace: string }>(`/api/join/${token}`),
)

const name = ref('')
const password = ref('')
const error = ref('')
const pending = ref(false)

async function submit() {
  if (pending.value) return
  pending.value = true; error.value = ''
  try {
    await $fetch(`/api/join/${token}`, { method: 'POST', body: { name: name.value, password: password.value } })
    await refreshSession()
    await navigateTo('/')
  } catch (e: unknown) {
    error.value = (e as { statusMessage?: string })?.statusMessage || 'Inscription impossible'
  } finally { pending.value = false }
}
</script>

<template>
  <div class="bg-muted flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
    <div class="flex w-full max-w-sm flex-col gap-6">
      <!-- Brand -->
      <a href="/login" class="flex items-center gap-2 self-center font-medium">
        <div class="flex size-7 items-center justify-center rounded-md" style="background: linear-gradient(140deg, #8A7DFF 0%, #5B5BD6 55%, #3F38B5 100%);">
          <span style="color: #fff; font-size: 14px; font-weight: 800; letter-spacing: -0.5px; font-family: var(--font-mono);">B</span>
        </div>
        Bicycle · Product OS
      </a>

      <Card>
        <!-- Invalid / expired invite -->
        <template v-if="inviteError">
          <CardHeader class="text-center">
            <CardTitle class="text-xl">Invitation invalide</CardTitle>
            <CardDescription>Ce lien est invalide ou expiré. Demande-en un nouveau à l'owner du workspace.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" class="w-full" @click="navigateTo('/login')">Aller à la connexion</Button>
          </CardContent>
        </template>

        <!-- Accept invite -->
        <template v-else>
          <CardHeader class="text-center">
            <CardTitle class="text-xl">Rejoindre {{ invite?.workspace }}</CardTitle>
            <CardDescription>Invité en tant que {{ invite?.role === 'owner' ? 'Owner' : 'Membre' }} — choisis un nom et un mot de passe.</CardDescription>
          </CardHeader>
          <CardContent>
            <form @submit.prevent="submit">
              <div class="grid gap-6">
                <div class="grid gap-2">
                  <Label for="jemail">Email</Label>
                  <Input id="jemail" :model-value="invite?.email" type="email" disabled />
                </div>
                <div class="grid gap-2">
                  <Label for="jname">Nom</Label>
                  <Input id="jname" v-model="name" autocomplete="name" placeholder="Votre nom" required />
                </div>
                <div class="grid gap-2">
                  <Label for="jpass">Mot de passe</Label>
                  <Input id="jpass" v-model="password" type="password" autocomplete="new-password" placeholder="Au moins 8 caractères" required />
                </div>
                <p v-if="error" class="text-destructive text-sm">{{ error }}</p>
                <Button type="submit" class="w-full" :disabled="pending || !name.trim() || password.length < 8">{{ pending ? 'Création…' : 'Rejoindre le workspace' }}</Button>
              </div>
            </form>
          </CardContent>
        </template>
      </Card>
    </div>
  </div>
</template>
