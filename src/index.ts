type DataType = 'dict' | 'record' | void
function checkType(item?: Obj, key?: string, labelField?: string): DataType {
  if (item && typeof item === 'object') {
    return (key && labelField) || ('value' in item && 'label' in item)
      ? 'dict'
      : key && key in item
      ? 'record'
      : undefined
  }
}

function buildMap(list, keyField?: string, labelField?: string) {
  const dataType = checkType(list?.[0], keyField, labelField)
  if (dataType && list.length > 0) {
    const map: Obj = {}
    for (const item of list) {
      if (dataType === 'record') {
        const value = item[keyField as string]
        if (value !== undefined && value !== null) map[value] = item
      } else if (dataType === 'dict') {
        const key = item[keyField || 'value']
        const label = item[labelField || 'label']
        if (key !== undefined && key !== null) map[key] = label
      }
    }
    return map
  }
}

export type CacheParam<T = any, P extends any[] = any> = {
  request: (...args: P) => Promise<T>
  name?: string
  keyField?: string
  labelField?: string
}

interface SyncData<T> {
  reload: () => Promise<SyncData<T>>
  status: 'ready' | 'pending' | 'loaded' | 'error'
  res?: T
  keyField?: string
  labelField?: string
}
type DictMap<T> = T extends any[] ? Record<string, T[0] extends { value: any; label: string } ? string : T[0]> : T

export class CacheResult<T extends Obj | Obj[] = Obj> {
  /* 异步获取缓存原始数据 */
  load: () => Promise<SyncData<T>>
  constructor(request: Fn<Promise<any>>, ...param)
  constructor(config: CacheParam, ...param)
  constructor(config: Fn<Promise<any>> | CacheParam, ...param) {
    let status: SyncData<T>['status'] = 'ready'
    let delay = false
    let _promise: Promise<SyncData<T>>
    Object.defineProperties(this, {
      _refresh: { writable: true, value: false },
      _map: { writable: true, value: undefined },
      _result: { writable: true, value: undefined },
    })

    const _config: CacheParam = typeof config === 'function' ? { request: config } : config
    const { request, keyField, labelField } = _config
    const reload = () => {
      status = 'ready'
      return delay ? _promise : this.load()
    }

    this.load = () => {
      if (status !== 'ready') return _promise
      status = 'pending'
      delay = true
      return (_promise = request(...param)
        .then((res) => {
          status = 'loaded'
          this['_refresh'] = true
          const info = {
            status,
            res,
            keyField,
            labelField,
            reload,
          }
          return info
        })
        .catch((err) => {
          status = 'error'
          return { status, reload }
        })).finally(() => {
        setTimeout(() => {
          delay = false
        }, 1000)
      })
    }
    this.load()
  }

  /** 重新缓存数据，返回原始数据 */
  reload() {
    return this.load().then(({ reload }) => {
      return reload().then((result) => {
        if (result.status === 'loaded') {
          this['_result'] = result.res
          if (this['_map']) this.getMap(true)
        }
        return result
      })
    })
  }

  /** 异步获取缓存数据，若缓存不存在则重新缓存 */
  getResult() {
    return this.load()
      .then((result) => (result.status === 'error' ? this.reload() : result))
      .then(({ res, keyField, labelField }) => {
        if (this['_refresh']) {
          this['_refresh'] = false
          // 取值时进行赋值，被vue代理时this对象为代理对象，可监测数据变化，在构造时this为原始对象，赋值不会响应。
          if (keyField && labelField) {
            this['_result'] = res?.map((item) => ({
              original: item,
              value: item[keyField],
              label: item[labelField],
            }))
          } else {
            this['_result'] = res
          }
        }
        return this['_result'] as T
      })
  }

  get result() {
    this.getResult()
    return this['_result']
  }

  /** 将缓存数据转换为字典映射 */
  getMap(force?: boolean) {
    return this.load().then(({ res = [], keyField, labelField }) => {
      if (!this['_map'] || force) {
        return (this['_map'] = buildMap(res, keyField, labelField) as DictMap<T>)
      }
      return this['_map'] || {}
    })
  }

  get map() {
    this.getMap()
    return (this['_map'] || {}) as DictMap<T>
  }
}

type CacheConfig<T extends Obj, P extends any[]> = {
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

  const getData = (...args) => {
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

type CacheStoreConfig = {
  store?: Obj
  transform?: (data: CacheResult) => Obj
}
type GetRequest<T extends Fn | CacheParam> = T extends { request: infer P } ? P : T
type RequestReturn<T extends Fn | CacheParam> = ReturnType<GetRequest<T>> extends Promise<infer R>
  ? NonNullable<R>
  : never

export function registBatch<T extends Obj<Fn | CacheParam>>(apis: T, config: CacheStoreConfig = {}) {
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
type Dict<T = any> = {
  id: T
  label: string
  value: T
}
type CacheProduce<> = {
  <P extends any[], R extends Obj<any>[], K extends keyof R[0] & string, L extends keyof R[0] & string>(
    api: CacheParam<R, P> & { keyField: K; labelField: L }
  ): (
    ...args: P
  ) => CacheResult<Dict<R[0][K]>[]>
  <P extends any[], R extends Obj<any>>(api: CacheParam<R, P> | ((...args: P) => Promise<R>)): (
    ...args: P
  ) => CacheResult<R>
}
export function createCacheStore(config: CacheStoreConfig) {
  const { store = {}, transform } = config
  const apisMap = new Map()

  const produce: CacheProduce = (api: any) => {
    const { request, name, keyField, labelField }: CacheParam = typeof api === 'function' ? { request: api } : api
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
    produceBatch: <T extends Obj<Fn | CacheParam>>(apis: T) => registBatch(apis, { store, transform }),
    produce,
  }
}

function produce<T extends Obj<Fn | CacheParam>>(config: T) {
  const caches: {
    [K in keyof T]: (...args: Parameters<GetRequest<T[K]>>) => CacheResult<RequestReturn<T[K]>>
  } = {} as any

  Object.keys(config).forEach((key) => {
    caches[key as keyof T] = cacheProduce(config[key])
  })
  return caches
}

function cacheProduce<T extends Obj, P extends any[]>(api: CacheParam<T, P> | ((...arg: P) => Promise<T>)) {
  const config = typeof api === 'function' ? { request: api } : api
  return (...args: P) => {
    const cache = new CacheResult<T>(config, ...args)
    let result = cache.result
    const obj: Obj = {
      load: () => cache.load(),
      reload: () => cache.reload(),
      getResult: () => cache.getResult(),
      get result() {
        cache.getResult().then((res) => (result = res))
        return result
      },
      getMap: () => cache.getMap(),
      get map() {
        return cache.map
      },
    }
    return obj as CacheResult<T>
  }
}
