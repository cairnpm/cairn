<script setup lang="ts">
import { ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSeparator } from '@/components/ui/field'

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
  <div class="bg-background flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
    <div class="w-full max-w-sm">
      <form class="flex flex-col gap-6" @submit.prevent="submit">
        <FieldGroup>
          <!-- Brand / heading -->
          <div class="flex flex-col items-center gap-2 text-center">
            <div class="flex size-10 items-center justify-center rounded-[11px]" style="background: linear-gradient(140deg, #8A7DFF 0%, #5B5BD6 55%, #3F38B5 100%); box-shadow: 0 6px 20px rgba(91,91,214,0.32);">
              <span style="color: #fff; font-size: 17px; font-weight: 800; letter-spacing: -0.6px; font-family: var(--font-mono);">B</span>
            </div>
            <h1 class="text-xl font-bold tracking-tight">{{ t('login.title') }} · Bicycle</h1>
            <FieldDescription>Product OS — connectez-vous pour continuer</FieldDescription>
          </div>

          <Field>
            <FieldLabel for="email">{{ t('login.email') }}</FieldLabel>
            <Input id="email" v-model="email" type="email" autocomplete="username" placeholder="ceo@bicycle.local" required />
          </Field>

          <Field>
            <FieldLabel for="password">{{ t('login.password') }}</FieldLabel>
            <Input id="password" v-model="password" type="password" autocomplete="current-password" placeholder="••••••••" required />
          </Field>

          <p v-if="error" class="text-destructive text-[12.5px]">{{ error }}</p>

          <Field>
            <Button type="submit" :disabled="pending">{{ pending ? t('login.pending') : t('login.submit') }}</Button>
          </Field>

          <FieldSeparator>Démo</FieldSeparator>
          <FieldDescription class="text-center">
            <code style="font-family: var(--font-mono);">ceo@bicycle.local</code> · mot de passe <code style="font-family: var(--font-mono);">bicycle</code>
          </FieldDescription>
        </FieldGroup>
      </form>
    </div>
  </div>
</template>
