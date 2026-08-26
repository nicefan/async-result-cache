export type Obj<T = any> = Record<PropertyKey, T>
export type Fn<T = any> = (...args: any[]) => T

export type CacheOptions<T = any, P extends any[] = any> = {
  request: (...args: P) => Promise<T>
  name?: string
  keyField?: string
  labelField?: string
}

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
  getResult(): Promise<Result>
  getMap(): Promise<DictMap<Result>>
  reload(): Promise<Result>
  clear(): void
}

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

export type CacheResultFor<T extends Fn | CacheOptions> = T extends {
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

export interface CacheFactory {
  register<
    P extends any[],
    R extends Obj<any>[],
    K extends keyof R[0] & string,
    L extends keyof R[0] & string,
  >(
    api: CacheOptions<R, P> & { keyField: K; labelField: L }
  ): (...args: P) => CacheResult<DictionaryOption<R[0], K, L>[]>

  register<P extends any[], R extends Obj<any>>(
    api: CacheOptions<R, P> | ((...args: P) => Promise<R>)
  ): (...args: P) => CacheResult<R>

  registerGroup<const T extends Obj<Fn | CacheOptions>>(
    apis: T
  ): {
    [K in keyof T]: (...args: Parameters<GetRequest<T[K]>>) => CacheResultFor<T[K]>
  }

  clear(name: string): void
  clearAll(): void
}
