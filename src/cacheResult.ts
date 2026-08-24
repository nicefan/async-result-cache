import { buildMap } from './map'
import type { CacheParam, DictMap, Fn, Obj, SyncData } from './types'

export class CacheResult<T extends Obj | Obj[] = Obj> {
  private declare _refresh: boolean
  private declare _map: DictMap<T> | undefined
  private declare _result: T | undefined

  /* 异步获取缓存原始数据 */
  load: () => Promise<SyncData<T>>

  constructor(request: Fn<Promise<any>>, ...param: any[])
  constructor(config: CacheParam, ...param: any[])
  constructor(config: Fn<Promise<any>> | CacheParam, ...param: any[]) {
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
          this._refresh = true
          return {
            status,
            res,
            keyField,
            labelField,
            reload,
          }
        })
        .catch(() => {
          status = 'error'
          return { status, reload }
        }))
        .finally(() => {
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
          this._result = result.res
          if (this._map) this.getMap(true)
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
        if (this._refresh) {
          this._refresh = false
          // 取值时进行赋值，被 Vue 代理时 this 对象为代理对象，可监测数据变化。
          if (keyField && labelField) {
            this._result = (res as Obj[] | undefined)?.map((item) => ({
              original: item,
              value: item[keyField],
              label: item[labelField],
            })) as unknown as T
          } else {
            this._result = res
          }
        }
        return this._result as T
      })
  }

  get result() {
    this.getResult()
    return this._result
  }

  /** 将缓存数据转换为字典映射 */
  getMap(force?: boolean) {
    return this.load().then(({ res, keyField, labelField }) => {
      if (!this._map || force) {
        return (this._map = buildMap((res || []) as Obj[], keyField, labelField) as DictMap<T>)
      }
      return this._map || {}
    })
  }

  get map() {
    this.getMap()
    return (this._map || {}) as DictMap<T>
  }
}
