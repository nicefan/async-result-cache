import { buildMap } from './map'
import type { CacheOptions, CacheStatus, DictMap, Fn, Obj } from './types'

export class CacheEntry<Raw extends Obj | Obj[] = Obj, Result = Raw> {
  private _cachedData: Raw | undefined
  private _inFlight: Promise<Raw> | undefined
  private _map: DictMap<Result> | undefined
  private _result: Result | undefined
  private _status: CacheStatus = 'ready'
  private _error: unknown
  private _requestId = 0
  private readonly _request: (...args: any[]) => Promise<Raw>
  private readonly _param: any[]
  private readonly _keyField?: string
  private readonly _labelField?: string
  private readonly _resultPromises = new WeakMap<Promise<Raw>, Promise<Result>>()

  constructor(request: Fn<Promise<Raw>>, ...param: any[])
  constructor(config: CacheOptions<Raw>, ...param: any[])
  constructor(config: Fn<Promise<Raw>> | CacheOptions<Raw>, ...param: any[]) {
    const cacheConfig: CacheOptions<Raw> =
      typeof config === 'function' ? { request: config } : config

    this._request = cacheConfig.request
    this._param = param
    this._keyField = cacheConfig.keyField
    this._labelField = cacheConfig.labelField

    // 保持创建时预加载；在调用方读取前处理拒绝，避免未处理拒绝警告。
    void this.startLoad().catch(() => undefined)
  }

  get status() {
    return this._status
  }

  get error() {
    return this._error
  }

  private startLoad() {
    if (this._inFlight) return this._inFlight

    const requestId = ++this._requestId
    this._status = 'pending'
    this._error = undefined

    let requestPromise: Promise<Raw>
    try {
      requestPromise = Promise.resolve(this._request(...this._param))
    } catch (error) {
      requestPromise = Promise.reject(error)
    }

    const promise = requestPromise
      .then((res) => {
        if (requestId === this._requestId) {
          this._cachedData = res
          this._map = undefined
          this._status = 'loaded'
        }
        return res
      })
      .catch((error: unknown) => {
        if (requestId === this._requestId) {
          this._status = 'error'
          this._error = error
        }
        throw error
      })
      .finally(() => {
        if (this._inFlight === promise) this._inFlight = undefined
      })

    this._inFlight = promise
    return promise
  }

  private getRawResult() {
    if (this._inFlight) return this._inFlight
    if (this._cachedData !== undefined) return Promise.resolve(this._cachedData)
    if (this._status === 'error') return Promise.reject(this._error)
    return this.startLoad()
  }

  private transformResult(res: Raw): Result {
    if (Array.isArray(res) && this._keyField && this._labelField) {
      return res.map((item) => ({
        original: item,
        value: item[this._keyField as string],
        label: item[this._labelField as string],
      })) as unknown as Result
    }
    return res as unknown as Result
  }

  private resolveResult(rawPromise: Promise<Raw>, requestId: number) {
    const existing = this._resultPromises.get(rawPromise)
    if (existing) return existing

    const promise = rawPromise.then((res) => {
      const result = this.transformResult(res)
      if (requestId === this._requestId) this._result = result
      return result
    })
    this._resultPromises.set(rawPromise, promise)
    return promise
  }

  /** 获取缓存结果；没有缓存时等待首次请求，不会在失败后自动重试。 */
  getResult(): Promise<Result> {
    if (!this._inFlight && this._result !== undefined) return Promise.resolve(this._result)

    const rawPromise = this.getRawResult()
    return this.resolveResult(rawPromise, this._requestId)
  }

  /** 主动刷新并返回新结果；仅合并仍在进行中的请求。 */
  reload(): Promise<Result> {
    const rawPromise = this.startLoad()
    return this.resolveResult(rawPromise, this._requestId)
  }

  /** 清除缓存；进行中的底层请求不会取消，但其结果不会重新写入缓存。 */
  clear() {
    this._requestId += 1
    this._cachedData = undefined
    this._inFlight = undefined
    this._map = undefined
    this._result = undefined
    this._error = undefined
    this._status = 'ready'
  }

  get result(): Result | undefined {
    void this.getResult().catch(() => undefined)
    return this._result
  }

  /** 将缓存的原始数组转换为字典映射。 */
  async getMap(force = false): Promise<DictMap<Result>> {
    if (!this._inFlight && this._map !== undefined && !force) return this._map

    const requestId = this._requestId
    const res = await this.getRawResult()
    const map = (buildMap(
      (Array.isArray(res) ? res : []) as Obj[],
      this._keyField,
      this._labelField
    ) || Object.create(null)) as DictMap<Result>

    if (requestId === this._requestId) this._map = map
    return map
  }

  get map(): DictMap<Result> {
    void this.getMap().catch(() => undefined)
    return (this._map || Object.create(null)) as DictMap<Result>
  }
}
