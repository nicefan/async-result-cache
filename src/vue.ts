import {
  getCurrentScope,
  onScopeDispose,
  shallowRef,
  triggerRef,
} from 'vue'

import { adaptFactory } from './adaptFactory'
import type {
  CacheApi,
  CacheControllerFor,
  CacheFactory,
  CacheResult,
  CacheValueFor,
  GetRequest,
} from './types'

export type VueCacheFactory = CacheFactory
export type VueCacheResult<Result = any> = CacheResult<Result>

function adapt<Result>(entry: CacheResult<Result>): CacheResult<Result> {
  if (!getCurrentScope()) {
    // effect scope 外没有可靠的自动清理时机，直接返回普通缓存状态，避免遗留订阅。
    return entry
  }

  const signal = shallowRef()
  const unsubscribe = entry.subscribe(() => triggerRef(signal))
  onScopeDispose(unsubscribe)

  return new Proxy(entry, {
    get(target, key, receiver) {
      signal.value
      return Reflect.get(target, key, receiver)
    },
  })
}

export function createCacheScope(): VueCacheFactory {
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
