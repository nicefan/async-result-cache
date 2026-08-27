import { createCacheScope } from './createCacheScope'
import type {
  CacheApi,
  CacheController,
  CacheControllerFor,
  CacheFactory,
  CacheResult,
  CacheValueFor,
  GetRequest,
  Obj,
} from './types'

type EntryAdapter = <Result>(entry: CacheResult<Result>) => CacheResult<Result>

export function adaptFactory(adapt: EntryAdapter): CacheFactory {
  const factory = createCacheScope()
  const adapted = new WeakMap<object, object>()

  const wrap = <const T extends CacheApi>(
    controller: CacheControllerFor<T>
  ): CacheControllerFor<T> => {
    type P = Parameters<GetRequest<T>>
    type Result = CacheValueFor<T>

    let result = adapted.get(controller) as CacheControllerFor<T> | undefined
    if (!result) {
      const adaptedController: CacheController<P, Result> = Object.freeze({
        get: (...args: P) => controller.get(...args),
        getResult: (...args: P) => controller.getResult(...args),
        getMap: (...args: P) => controller.getMap(...args),
        reload: (...args: P) => controller.reload(...args),
        // 普通控制器方法可在任意环境调用，仅 useEntry 建立框架响应式订阅。
        useEntry: (...args: P) => adapt(controller.useEntry(...args)),
        clear: (...args: P) => controller.clear(...args),
      })
      result = adaptedController
      adapted.set(controller, result)
    }
    return result
  }

  const cache = <const T extends CacheApi>(api: T) =>
    wrap<T>(factory.cache(api))

  const cacheGroup = <const T extends Obj<CacheApi>>(apis: T) => {
    const group = factory.cacheGroup(apis)
    const result = Object.create(null) as {
      [K in keyof T]: CacheControllerFor<T[K]>
    }
    const names = Object.keys(group) as (keyof T & string)[]
    names.forEach((name) => {
      result[name] = wrap(group[name])
    })
    return result
  }

  return {
    cache,
    cacheGroup,
    clear: (name: string) => factory.clear(name),
    clearAll: () => factory.clearAll(),
  }
}
