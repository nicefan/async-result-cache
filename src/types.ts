export type Obj<T = any> = Record<PropertyKey, T>
export type Fn<T = any> = (...args: any[]) => T

export type CacheParam<T = any, P extends any[] = any> = {
  request: (...args: P) => Promise<T>
  name?: string
  keyField?: string
  labelField?: string
}

export interface SyncData<T> {
  reload: () => Promise<SyncData<T>>
  status: 'ready' | 'pending' | 'loaded' | 'error'
  res?: T
  keyField?: string
  labelField?: string
}

export type DictMap<T> = T extends any[]
  ? Record<string, T[0] extends { value: any; label: string } ? string : T[0]>
  : T

export type GetRequest<T extends Fn | CacheParam> = T extends {
  request: infer P extends Fn
}
  ? P
  : Extract<T, Fn>

export type RequestReturn<T extends Fn | CacheParam> = ReturnType<GetRequest<T>> extends Promise<
  infer R
>
  ? NonNullable<R>
  : never

export type Dict<T = any> = {
  id: T
  label: string
  value: T
}
