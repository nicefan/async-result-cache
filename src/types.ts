export type Obj<T = any> = Record<PropertyKey, T>
export type Fn<T = any> = (...args: any[]) => T

export type CacheOptions<T = any, P extends any[] = any> = {
  request: (...args: P) => Promise<T>
  name?: string
  keyField?: string
  labelField?: string
}

export type CacheApi<T = any, P extends any[] = any[]> =
  | CacheOptions<T, P>
  | ((...args: P) => Promise<T>)

export type DictMap<T> = T extends any[]
  ? Record<string, T[0] extends { value: any; label: infer Label } ? Label : T[0]>
  : Record<PropertyKey, never>

export type DictionaryOption<
  T extends Obj = Obj,
  K extends keyof T = keyof T,
  L extends keyof T = keyof T,
> = {
  original: T
  value: T[K]
  label: T[L]
}

export interface CacheResult<Result = any> {
  readonly result: Result | undefined
  readonly map: DictMap<Result>
  subscribe(listener: () => void): () => void
  getResult(): Promise<Result>
  getMap(): Promise<DictMap<Result>>
  reload(): Promise<Result>
  clear(): void
}

export interface CacheData<Result = any> {
  result: Result
  map: DictMap<Result>
}

export interface CacheController<P extends any[] = any[], Result = any> {
  get(...args: P): Promise<CacheData<Result>>
  getResult(...args: P): Promise<Result>
  getMap(...args: P): Promise<DictMap<Result>>
  reload(...args: P): Promise<Result>
  useEntry(...args: P): CacheResult<Result>
  clear(...args: P): void
}

export type GetRequest<T extends CacheApi> = T extends {
  request: infer P extends Fn
}
  ? P
  : Extract<T, Fn>

export type RequestReturn<T extends CacheApi> = ReturnType<GetRequest<T>> extends Promise<
  infer R
>
  ? NonNullable<R>
  : never

export type CacheResultFor<T extends CacheApi> = T extends {
  keyField: infer K
  labelField: infer L
}
  ? RequestReturn<T> extends (infer Item extends Obj)[]
    ? K extends keyof Item
      ? L extends keyof Item
        ? CacheResult<DictionaryOption<Item, K, L>[]>
        : CacheResult<RequestReturn<T>>
      : CacheResult<RequestReturn<T>>
    : CacheResult<RequestReturn<T>>
  : CacheResult<RequestReturn<T>>

export type CacheValueFor<T extends CacheApi> =
  CacheResultFor<T> extends CacheResult<infer Result> ? Result : never

export type CacheControllerFor<T extends CacheApi> = CacheController<
  Parameters<GetRequest<T>>,
  CacheValueFor<T>
>

export interface CacheFactory {
  cache<const T extends CacheApi>(api: T): CacheControllerFor<T>

  cacheGroup<const T extends Obj<CacheApi>>(
    apis: T
  ): {
    [K in keyof T]: CacheControllerFor<T[K]>
  }

  clear(name: string): void
  clearAll(): void
}
