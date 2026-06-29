<script setup lang="ts">
import { ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

definePageMeta({ layout: false })

const { t } = useUiLang()
const { fetch: refreshSession, loggedIn } = useUserSession()
if (loggedIn.value) await navigateTo('/')

const email = ref('')
const password = ref('')
const error = ref('')
const pending = ref(false)

async function submit() {
  if (pending.value) return
  pending.value = true
  error.value = ''
  try {
    await $fetch('/api/auth/login', { method: 'POST', body: { email: email.value, password: password.value } })
    await refreshSession()
    await navigateTo('/')
  } catch (e: unknown) {
    error.value = (e as { statusMessage?: string })?.statusMessage || 'Connexion impossible'
  } finally {
    pending.value = false
  }
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
        <CardHeader class="text-center">
          <CardTitle class="text-xl">{{ t('login.title') }}</CardTitle>
          <CardDescription>Connectez-vous pour continuer</CardDescription>
        </CardHeader>
        <CardContent>
          <form @submit.prevent="submit">
            <div class="grid gap-6">
              <div class="grid gap-2">
                <Label for="email">{{ t('login.email') }}</Label>
                <Input id="email" v-model="email" type="email" autocomplete="username" placeholder="ceo@bicycle.local" required />
              </div>
              <div class="grid gap-2">
                <Label for="password">{{ t('login.password') }}</Label>
                <Input id="password" v-model="password" type="password" autocomplete="current-password" placeholder="••••••••" required />
              </div>
              <p v-if="error" class="text-destructive text-sm">{{ error }}</p>
              <Button type="submit" class="w-full" :disabled="pending">{{ pending ? t('login.pending') : t('login.submit') }}</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div class="text-muted-foreground text-center text-xs text-balance">
        Démo · <code style="font-family: var(--font-mono);">ceo@bicycle.local</code> · mot de passe <code style="font-family: var(--font-mono);">bicycle</code>
      </div>
    </div>
  </div>
</template>
