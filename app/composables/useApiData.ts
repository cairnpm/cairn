import type { AsyncData, UseFetchOptions } from '#app'
import type { FetchError } from 'ofetch'
import type { QueryKey } from '~/utils/queryKeys'

// Canonical read: a stable cache key (so mutations can invalidate it) + the SSR-safe cache policy.
// Use this for every screen read instead of a bare useFetch, so the whole app shares one convention.
//
// useFetch + getCachedData makes TS resolve `data` to `PickFrom<_ResT, …>` (the named interface is
// lost, so consumers can't read its properties). The overloads below re-expose `data` as Ref<T> when a
// `default` is given (never null) or Ref<T | null> otherwise — the rest of the AsyncData result is kept.
export function useApiData<T>(key: QueryKey, url: string | (() => string), opts: Omit<UseFetchOptions<T>, 'default'> & { default: () => T }): AsyncData<T, FetchError | null>
export function useApiData<T>(key: QueryKey, url: string | (() => string), opts?: UseFetchOptions<T>): AsyncData<T | null, FetchError | null>
export function useApiData<T>(key: QueryKey, url: string | (() => string), opts?: UseFetchOptions<T>) {
  // useFetch's options generic uses a `T extends void ? unknown : T` conditional a generic wrapper
  // can't satisfy; the public overloads above are the real, type-safe contract and the result is
  // re-typed below. (Library-boundary limitation, not an app type bug.)
  // @ts-expect-error — see above
  return useFetch<T>(url, { key, getCachedData: getFreshData, ...opts }) as unknown as AsyncData<T | null, FetchError | null>
}
