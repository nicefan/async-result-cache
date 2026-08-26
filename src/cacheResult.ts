import { buildMap } from './map'
import type { CacheOptions, CacheResult, DictMap, Fn, Obj } from './types'

type EntryStatus = 'ready' | 'pending' | 'loaded' | 'error'

export class CacheEntry<Raw extends Obj | Obj[] = Obj, Result = Raw>
  implements CacheResult<Result>
{
  _cachedData: Raw | undefined
  _inFlight: Promise<Raw> | undefined
  _map: DictMap<Result> | undefined
  _result: Result | undefined
  _status: EntryStatus = 'ready'
  _error: unknown
  _requestId = 0
  readonly _emptyMap = Object.create(null) as DictMap<Result>
  readonly _request: (...args: any[]) => Promise<Raw>
  readonly _params: any[]
  readonly _keyField?: string
  readonly _labelField?: string
  readonly _resultPromises = new WeakMap<Promise<Raw>, Promise<Result>>()

  constructor(request: Fn<Promise<Raw>>, ...params: any[])
  constructor(config: CacheOptions<Raw>, ...params: any[])
  constructor(config: Fn<Promise<Raw>> | CacheOptions<Raw>, ...params: any[]) {
    const options: CacheOptions<Raw> =
      typeof config === 'function' ? { request: config } : config

    this._request = options.request
    this._params = params
    this._keyField = options.keyField
    this._labelField = options.labelField

    void this._startLoad().catch(() => undefined)
  }

  _startLoad() {
    if (this._inFlight) return this._inFlight

    const requestId = ++this._requestId
    this._status = 'pending'
    this._error = undefined

    let requestPromise: Promise<Raw>
    try {
      requestPromise = Promise.resolve(this._request(...this._params))
    } catch (error) {
      requestPromise = Promise.reject(error)
    }

    const promise = requestPromise
      .then((raw) => {
        if (requestId === this._requestId) {
          this._cachedData = raw
          this._result = undefined
          this._map = undefined
          this._status = 'loaded'
        }
        return raw
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

  _getRawResult() {
    if (this._inFlight) return this._inFlight
    if (this._cachedData !== undefined) return Promise.resolve(this._cachedData)
    if (this._status === 'error') return Promise.reject(this._error)
    return this._startLoad()
  }

  _transformResult(raw: Raw): Result {
    if (Array.isArray(raw) && this._keyField && this._labelField) {
      return raw.map((item) => ({
        original: item,
        value: item[this._keyField as string],
        label: item[this._labelField as string],
      })) as unknown as Result
    }
    return raw as unknown as Result
  }

  _resolveResult(rawPromise: Promise<Raw>) {
    const existing = this._resultPromises.get(rawPromise)
    if (existing) return existing

    const promise = rawPromise.then(() => this.result as Result)
    this._resultPromises.set(rawPromise, promise)
    return promise
  }

  getResult(): Promise<Result> {
    if (!this._inFlight && this._result !== undefined) {
      return Promise.resolve(this._result)
    }

    const rawPromise = this._getRawResult()
    return this._resolveResult(rawPromise)
  }

  reload(): Promise<Result> {
    const rawPromise = this._startLoad()
    return this._resolveResult(rawPromise)
  }

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
    if (this._result === undefined && this._cachedData !== undefined) {
      this._result = this._transformResult(this._cachedData)
    }
    return this._result
  }

  async getMap(): Promise<DictMap<Result>> {
    await this._getRawResult()
    return this.map
  }

  get map(): DictMap<Result> {
    if (this._map !== undefined) return this._map
    if (this._cachedData === undefined) return this._emptyMap

    return (this._map = (buildMap(
      (Array.isArray(this._cachedData) ? this._cachedData : []) as Obj[],
      this._keyField,
      this._labelField
    ) || this._emptyMap) as DictMap<Result>)
  }
}
