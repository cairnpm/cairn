<script setup lang="ts">
import { ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

definePageMeta({ layout: false })

const { t } = useUiLang()
useSeoMeta({ title: () => t('join.seoTitle') })

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
    error.value = (e as { statusMessage?: string })?.statusMessage || t('join.error')
  } finally { pending.value = false }
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
        <!-- Invalid / expired invite -->
        <template v-if="inviteError">
          <CardHeader class="text-center">
            <CardTitle class="text-xl">{{ t('join.invalidTitle') }}</CardTitle>
            <CardDescription>{{ t('join.invalidDesc') }}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" class="w-full" @click="navigateTo('/login')">{{ t('join.goToLogin') }}</Button>
          </CardContent>
        </template>

        <!-- Accept invite -->
        <template v-else>
          <CardHeader class="text-center">
            <CardTitle class="text-xl">{{ t('join.title', { workspace: invite?.workspace ?? '' }) }}</CardTitle>
            <CardDescription>{{ t('join.subtitle', { role: invite?.role === 'owner' ? 'Owner' : t('join.roleMember') }) }}</CardDescription>
          </CardHeader>
          <CardContent>
            <form @submit.prevent="submit">
              <div class="grid gap-6">
                <div class="grid gap-2">
                  <Label for="jemail">{{ t('join.email') }}</Label>
                  <Input id="jemail" :model-value="invite?.email" type="email" disabled />
                </div>
                <div class="grid gap-2">
                  <Label for="jname">{{ t('join.name') }}</Label>
                  <Input id="jname" v-model="name" autocomplete="name" :placeholder="t('join.namePlaceholder')" required />
                </div>
                <div class="grid gap-2">
                  <Label for="jpass">{{ t('join.password') }}</Label>
                  <Input id="jpass" v-model="password" type="password" autocomplete="new-password" :placeholder="t('join.passwordPlaceholder')" required />
                </div>
                <p v-if="error" class="text-destructive text-sm">{{ error }}</p>
                <Button type="submit" class="w-full" :disabled="pending || !name.trim() || password.length < 8">{{ pending ? t('join.pending') : t('join.submit') }}</Button>
              </div>
            </form>
          </CardContent>
        </template>
      </Card>
    </div>
  </div>
</template>
