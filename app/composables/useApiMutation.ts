import type { QueryKey } from '~/utils/queryKeys'

// Invalidate one or more cache keys: every component reading them refetches and re-syncs.
export function invalidate(...keys: QueryKey[]): Promise<void> | void {
  if (keys.length) return refreshNuxtData(keys)
}

interface MutateOptions {
  method?: 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  invalidates?: QueryKey[]
}

// Canonical write: $fetch + declarative cache invalidation, with a shared `pending` flag. The caller
// declares which keys a mutation touches; on success every view of those resources re-syncs.
export function useApiMutation() {
  const pending = ref(false)
  async function mutate<T = unknown>(url: string, opts: MutateOptions = {}): Promise<T> {
    pending.value = true
    try {
      const res = await $fetch<T>(url, { method: opts.method ?? 'POST', body: opts.body as Record<string, unknown> })
      await invalidate(...(opts.invalidates ?? []))
      return res
    }
    finally {
      pending.value = false
    }
  }
  return { mutate, pending }
}
