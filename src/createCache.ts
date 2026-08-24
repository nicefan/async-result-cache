import { CacheEntry } from './cacheResult'
import type { CacheOptions, DictionaryOption, Obj } from './types'

type CacheConfig<T extends Obj | Obj[], P extends any[], Result = T> = {
  store?: Obj
  transform?: (data: CacheEntry<T, Result>) => Obj
} & CacheOptions<T, P>

export function createCache<
  P extends any[],
  R extends Obj<any>[],
  K extends keyof R[0] & string,
  L extends keyof R[0] & string
>(
  api: CacheConfig<R, P, DictionaryOption<R[0], K, L>[]> & {
    keyField: K
    labelField: L
  }
): (...args: P) => CacheEntry<R, DictionaryOption<R[0], K, L>[]>

export function createCache<R extends Obj, P extends any[]>(
  api: CacheConfig<R, P> | ((...args: P) => Promise<R>)
): (...args: P) => CacheEntry<R>

export function createCache(api: any) {
  const config = typeof api === 'function' ? { request: api } : api
  const { store = {}, transform, request, keyField, labelField } = config

  const getData = (...args: any[]) => {
    const key = JSON.stringify(args)
    let cache = Reflect.get(store, key)
    if (!cache) {
      cache = new CacheEntry({ request, keyField, labelField }, ...args)
      if (transform) cache = transform(cache)
      Reflect.set(store, key, cache)
    }
    return cache
  }
  return getData
}
