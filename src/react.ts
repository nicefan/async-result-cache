import { useCallback, useSyncExternalStore } from 'react'

import { adaptFactory } from './adaptFactory'
import type {
  CacheApi,
  CacheControllerFor,
  CacheFactory,
  CacheResult,
  CacheValueFor,
  GetRequest,
} from './types'

export type ReactCacheFactory = CacheFactory
export type ReactCacheResult<Result = any> = CacheResult<Result>

function adapt<Result>(entry: CacheResult<Result>): CacheResult<Result> {
  const subscribe = useCallback(
    (listener: () => void) => entry.subscribe(listener),
    [entry]
  )
  const getSnapshot = useCallback(() => entry.result, [entry])
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return entry
}

export function createCacheScope(): ReactCacheFactory {
  return adaptFactory(adapt)
}

const defaultScope = createCacheScope()

export function createCache<const T extends CacheApi>(
  api: T
): CacheControllerFor<T> {
  return defaultScope.cache(api)
}

export function createUseCache<const T extends CacheApi>(
  api: T
): (...args: Parameters<GetRequest<T>>) => CacheResult<CacheValueFor<T>> {
  return createCache(api).useEntry
}

export default createCacheScope
