export type Obj<T = any> = Record<PropertyKey, T>
export type Fn<T = any> = (...args: any[]) => T

export type CacheOptions<T = any, P extends any[] = any> = {
  request: (...args: P) => Promise<T>
  name?: string
  keyField?: string
  labelField?: string
}

export type CacheStatus = 'ready' | 'pending' | 'loaded' | 'error'

export type DictMap<T> = T extends any[]
  ? Record<string, T[0] extends { value: any; label: infer Label } ? Label : T[0]>
  : Record<PropertyKey, never>

export type GetRequest<T extends Fn | CacheOptions> = T extends {
  request: infer P extends Fn
}
  ? P
  : Extract<T, Fn>

export type RequestReturn<T extends Fn | CacheOptions> = ReturnType<GetRequest<T>> extends Promise<
  infer R
>
  ? NonNullable<R>
  : never

export type DictionaryOption<
  T extends Obj = Obj,
  K extends keyof T = keyof T,
  L extends keyof T = keyof T,
> = {
  original: T
  value: T[K]
  label: T[L]
}
