import { CacheResult } from './cacheResult'
import type { CacheParam, Dict, Obj } from './types'

type CacheConfig<T extends Obj | Obj[], P extends any[]> = {
  store?: Obj
  transform?: (data: CacheResult<T>) => Obj
} & CacheParam<T, P>

export function createCache<
  P extends any[],
  R extends Obj<any>[],
  K extends keyof R[0] & string,
  L extends keyof R[0] & string
>(api: CacheConfig<R, P> & { keyField: K; labelField: L }): (...args: P) => CacheResult<Dict<R[0][K]>[]>

export function createCache<R extends Obj, P extends any[]>(
  api: CacheConfig<R, P> | ((...args: P) => Promise<R>)
): (...args: P) => CacheResult<R>

export function createCache(api: any) {
  const config = typeof api === 'function' ? { request: api } : api
  const { store = {}, transform, request, keyField, labelField } = config

  const getData = (...args: any[]) => {
    const key = JSON.stringify(args)
    let cache = Reflect.get(store, key)
    if (!cache) {
      cache = new CacheResult({ request, keyField, labelField }, ...args)
      if (transform) cache = transform(cache)
      Reflect.set(store, key, cache)
    }
    return cache
  }
  return getData
}
