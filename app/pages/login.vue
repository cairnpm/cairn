<script setup lang="ts">
import { ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

definePageMeta({ layout: false })

const { t } = useUiLang()
useSeoMeta({ title: () => t('login.seoTitle') })
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
    error.value = (e as { statusMessage?: string })?.statusMessage || t('login.error')
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <div class="bg-muted flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
    <div class="flex w-full max-w-sm flex-col gap-6">
      <!-- Brand -->
      <a href="/login" class="flex flex-col items-center gap-3 self-center font-medium">
        <CairnMark inverted class="h-14 w-auto" />
        Cairn
      </a>

      <Card>
        <CardHeader class="text-center">
          <CardTitle class="text-xl">{{ t('login.title') }}</CardTitle>
          <CardDescription>{{ t('login.subtitle') }}</CardDescription>
        </CardHeader>
        <CardContent>
          <form @submit.prevent="submit">
            <div class="grid gap-6">
              <div class="grid gap-2">
                <Label for="email">{{ t('login.email') }}</Label>
                <Input id="email" v-model="email" type="email" autocomplete="username" placeholder="ceo@cairn.local" required />
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
        {{ t('login.demo') }} · <code style="font-family: var(--font-mono);">ceo@cairn.local</code> · {{ t('login.demoPassword') }} <code style="font-family: var(--font-mono);">cairn</code>
      </div>
    </div>
  </div>
</template>
