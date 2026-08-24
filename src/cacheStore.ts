import { createCache } from './createCache'
import type { CacheEntry } from './cacheResult'
import type {
  CacheOptions,
  DictionaryOption,
  Fn,
  GetRequest,
  Obj,
  RequestReturn,
} from './types'

export type CacheRegistryOptions = {
  store?: Obj
  transform?: (data: CacheEntry<any, any>) => Obj
}

type CacheEntryFor<T extends Fn | CacheOptions> = T extends {
  keyField: infer K
  labelField: infer L
}
  ? RequestReturn<T> extends (infer Item extends Obj)[]
    ? K extends keyof Item
      ? L extends keyof Item
        ? CacheEntry<RequestReturn<T>, DictionaryOption<Item, K, L>[]>
        : CacheEntry<RequestReturn<T>>
      : CacheEntry<RequestReturn<T>>
    : CacheEntry<RequestReturn<T>>
  : CacheEntry<RequestReturn<T>>

export function createCaches<const T extends Obj<Fn | CacheOptions>>(
  apis: T,
  config: CacheRegistryOptions = {}
) {
  const { store = {}, transform } = config

  const methods: {
    [K in keyof T]: (...args: Parameters<GetRequest<T[K]>>) => CacheEntryFor<T[K]>
  } = {} as any

  Object.keys(apis).forEach((key) => {
    const data = (store[key] = {})
    const api = apis[key]
    const config = typeof api === 'function' ? { request: api } : api
    methods[key as keyof T] = createCache({
      store: data,
      transform,
      ...config,
    }) as any
  })
  return methods
}

type CacheRegister = {
  <P extends any[], R extends Obj<any>[], K extends keyof R[0] & string, L extends keyof R[0] & string>(
    api: CacheOptions<R, P> & { keyField: K; labelField: L }
  ): (...args: P) => CacheEntry<R, DictionaryOption<R[0], K, L>[]>

  <P extends any[], R extends Obj<any>>(
    api: CacheOptions<R, P> | ((...args: P) => Promise<R>)
  ): (...args: P) => CacheEntry<R>
}

export function createCacheRegistry(config: CacheRegistryOptions) {
  const { store = {}, transform } = config
  const apisMap = new Map()

  const register: CacheRegister = (api: any) => {
    const { request, name, keyField, labelField }: CacheOptions =
      typeof api === 'function' ? { request: api } : api
    const dataKey = name || request
    if (!apisMap.has(dataKey)) {
      const data = (store[Symbol() as any] = {})
      apisMap.set(
        dataKey,
        createCache({
          store: data,
          transform,
          request,
          labelField,
          keyField,
        })
      )
    }
    return apisMap.get(dataKey)
  }

  return {
    registerAll: <const T extends Obj<Fn | CacheOptions>>(apis: T) =>
      createCaches(apis, { store, transform }),
    register,
  }
}
