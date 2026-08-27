import { CacheEntry } from './cacheResult'
import type {
  CacheApi,
  CacheFactory,
  CacheController,
  CacheControllerFor,
  CacheOptions,
  CacheValueFor,
  GetRequest,
  RequestReturn,
} from './types'

type CacheKey = string | ((...args: any[]) => Promise<any>)
type StoredEntry = CacheEntry<any, any, any[]>
type CacheStore = Map<string, StoredEntry>
type CacheStores = Map<CacheKey, CacheStore>

function normalize<Raw, P extends any[]>(
  api: CacheApi<Raw, P>
): CacheOptions<Raw, P> {
  return typeof api === 'function' ? { request: api } : api
}

function cacheProduce<const T extends CacheApi>(
  stores: CacheStores,
  api: T,
  name?: string
): CacheControllerFor<T> {
  type P = Parameters<GetRequest<T>>
  type Raw = RequestReturn<T>
  type Result = CacheValueFor<T>

  const normalized: CacheOptions<Raw, P> = normalize(api)
  const options = name ? { ...normalized, name } : normalized
  const storeKey = options.name || options.request
  const store: CacheStore = stores.get(storeKey) || new Map()

  const getEntry = (...args: P) => {
    const key = JSON.stringify(args)
    let entry = store.get(key) as CacheEntry<Raw, Result, P> | undefined
    if (!entry) {
      entry = new CacheEntry<Raw, Result, P>(options, ...args)
      store.set(key, entry)
    }
    return entry.exposed
  }

  const controller: CacheController<P, Result> = Object.freeze({
    async get(...args: P) {
      const entry = getEntry(...args)
      const [result, map] = await Promise.all([
        entry.getResult(),
        entry.getMap(),
      ])
      return { result, map }
    },
    getResult: (...args: P) => getEntry(...args).getResult(),
    getMap: (...args: P) => getEntry(...args).getMap(),
    reload: (...args: P) => getEntry(...args).reload(),
    useEntry: (...args: P) => getEntry(...args),
    clear(...args: P) {
      // 清理只作用于已有实例，不能因为清理操作创建实例或触发请求。
      store.get(JSON.stringify(args))?.clear()
    },
  })

  stores.set(storeKey, store)
  return controller
}

export function createCacheScope(): CacheFactory {
  const stores: CacheStores = new Map()

  const cache = <const T extends CacheApi>(api: T) =>
    cacheProduce(stores, api)

  const cacheGroup = <const T extends Record<string, CacheApi>>(apis: T) => {
    const cached = Object.create(null) as {
      [K in keyof T]: CacheControllerFor<T[K]>
    }
    const names = Object.keys(apis) as (keyof T & string)[]
    names.forEach((name) => {
      cached[name] = cacheProduce(stores, apis[name], name)
    })
    return cached
  }

  return {
    cache,
    cacheGroup,
    clear(name: string) {
      stores.get(name)?.forEach((entry) => entry.clear())
    },
    clearAll() {
      stores.forEach((store) => {
        store.forEach((entry) => entry.clear())
      })
    },
  }
}

const defaultScope = createCacheScope()

export function createCache<const T extends CacheApi>(
  api: T
): CacheControllerFor<T> {
  return defaultScope.cache(api)
}
