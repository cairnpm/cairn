import type { UseFetchOptions } from '#app'
import type { QueryKey } from '~/utils/queryKeys'

// Canonical read: a stable cache key (so mutations can invalidate it) + the SSR-safe cache policy.
// Use this for every screen read instead of a bare useFetch, so the whole app shares one convention.
export function useApiData<T>(key: QueryKey, url: string | (() => string), opts?: UseFetchOptions<T>) {
  return useFetch<T>(url, { key, getCachedData: getFreshData, ...opts })
}
