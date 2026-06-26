import type { NuxtApp } from '#app'

// useFetch getCachedData helper: use the SSR payload DURING hydration (so no hydration mismatch
// on hard reload), but skip the cache afterwards so client-side navigation always refetches fresh
// (read screens must reflect mutations made via the gateway). Returning undefined unconditionally
// breaks SSR hydration; this is the canonical pattern.
export function getFreshData<T>(key: string, nuxtApp: NuxtApp): T | undefined {
  return nuxtApp.isHydrating ? (nuxtApp.payload.data[key] as T | undefined) : undefined
}
