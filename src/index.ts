// 用户数据缓存
const store: Obj<CacheResult> = {}

/** 请求并缓存数据 */
export function getDataCache<T extends Obj = Obj>(type: string, request: Fn<Promise<any>>) {
  const cache = store[type] as CacheResult<T>
  if (!cache) {
    return new CacheResult<T>(type, request)
  } else if (cache.status === 'ready') {
    cache.load(request)
  }
  return cache
}

type DataType = 'dict'|'record'| void
function checkType(item?: Obj, key = 'id'): DataType {
  if (typeof item === 'object') {
    return ('value' in item && 'label' in item) ? 'dict': key in item ? 'record' : undefined
  }
}

export class CacheResult<T extends Obj = Obj> {
  list: T[] = []
  private _map?: Obj
  private _status: 'ready' | 'pending' | 'loaded' = 'ready'
  private _dataType?: DataType
  promise: Promise<T[]>

  constructor(public name: string, request: Fn<Promise<any>>, private _key?: string) {
    store[name] = this
    this.promise = this.load(request)
  }
  load(request: Fn<Promise<any>>) {
    this._status = 'pending'
    return request().then((data) => {
      this._status = 'loaded'
      this._dataType = checkType(data?.[0])
      return (this.list = data || [])
    },() => (this._status = 'ready'))
  }
  get status() {
    return this._status
  }
  get map() {
    if (!this._map && this._dataType && this.list.length > 0) {
      const map: Obj = {}
      for (const item of this.list) {
        if (this._dataType === 'record') {
          const key = this._key || 'id'
          if (item[key]) map[key] = item
        } else if (this._dataType = 'dict') {
          const { value, label } = item
          map[value] = label
        } 
      }
      this._map = Object.freeze(map)
    }
    return this._map || {}
  }

  get value() {
    return this.list
  }

  then(callback: (value: T[]) => any) {
    this.promise.then(callback)
  }

}
