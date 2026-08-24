import { createCache } from './createCache'
import type { CacheResult } from './cacheResult'
import type {
  CacheParam,
  Dict,
  Fn,
  GetRequest,
  Obj,
  RequestReturn,
} from './types'

export type CacheStoreConfig = {
  store?: Obj
  transform?: (data: CacheResult) => Obj
}

export function registerBatch<T extends Obj<Fn | CacheParam>>(
  apis: T,
  config: CacheStoreConfig = {}
) {
  const { store = {}, transform } = config

  const methods: {
    [K in keyof T]: (...args: Parameters<GetRequest<T[K]>>) => CacheResult<RequestReturn<T[K]>>
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

type CacheProduce = {
  <P extends any[], R extends Obj<any>[], K extends keyof R[0] & string, L extends keyof R[0] & string>(
    api: CacheParam<R, P> & { keyField: K; labelField: L }
  ): (...args: P) => CacheResult<Dict<R[0][K]>[]>

  <P extends any[], R extends Obj<any>>(
    api: CacheParam<R, P> | ((...args: P) => Promise<R>)
  ): (...args: P) => CacheResult<R>
}

export function createCacheStore(config: CacheStoreConfig) {
  const { store = {}, transform } = config
  const apisMap = new Map()

  const produce: CacheProduce = (api: any) => {
    const { request, name, keyField, labelField }: CacheParam =
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
    produceBatch: <T extends Obj<Fn | CacheParam>>(apis: T) =>
      registerBatch(apis, { store, transform }),
    produce,
  }
}
