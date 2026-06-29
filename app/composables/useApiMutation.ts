import { toast } from 'vue-sonner'
import type { QueryKey } from '~/utils/queryKeys'

// Invalidate one or more cache keys: every component reading them refetches and re-syncs.
export function invalidate(...keys: QueryKey[]): Promise<void> | void {
  if (keys.length) return refreshNuxtData(keys)
}

interface MutateOptions {
  method?: 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  invalidates?: QueryKey[]
  success?: string        // toast.success on success (the confirmation)
  errorToast?: boolean    // toast.error on failure (default true) — set false to handle errors yourself
}

function errorMessage(e: unknown): string {
  return (e as { statusMessage?: string })?.statusMessage
    || (e as { data?: { statusMessage?: string } })?.data?.statusMessage
    || 'Action impossible'
}

// Canonical write: $fetch + declarative cache invalidation + Sonner feedback. Every UI-triggered DB
// action that goes through here automatically SIGNALS failures (red toast) and CONFIRMS success when
// a `success` message is given (green toast). The caller declares which cache keys to re-sync.
export function useApiMutation() {
  const pending = ref(false)
  async function mutate<T = unknown>(url: string, opts: MutateOptions = {}): Promise<T> {
    pending.value = true
    try {
      const res = await $fetch<T>(url, { method: opts.method ?? 'POST', body: opts.body as Record<string, unknown> })
      await invalidate(...(opts.invalidates ?? []))
      if (opts.success) toast.success(opts.success)
      return res
    }
    catch (e) {
      if (opts.errorToast !== false) toast.error(errorMessage(e))
      throw e
    }
    finally {
      pending.value = false
    }
  }
  return { mutate, pending }
}
