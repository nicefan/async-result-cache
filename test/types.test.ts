import createCacheScope, {
  createCache,
  createCacheScope as createNamedCache,
  type CacheData,
  type CacheFactory,
  type CacheOptions,
  type CacheResult,
  type DictionaryOption,
} from '../src/index'
import createReactCacheScope, {
  createUseCache as createReactUseCache,
  type ReactCacheResult,
} from '../src/react'
import createVueCacheScope, {
  createUseCache as createVueUseCache,
  type VueCacheResult,
} from '../src/vue'

type User = { id: number; name: string }
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false
type Expect<T extends true> = T

const factory: CacheFactory = createCacheScope()
const namedFactory: CacheFactory = createNamedCache()
const request = async (id: number): Promise<User> => ({ id, name: String(id) })
const options: CacheOptions<User, [number]> = { request }
const getUser = factory.cache(options)
const result: CacheResult<User> = getUser.useEntry(1)
const user: Promise<User> = getUser.getResult(1)
const userData: Promise<CacheData<User>> = getUser.get(1)
const cachedUser: Promise<User> = createCache(request).getResult(1)

const getMapped = factory.cache({
  request: async (): Promise<User[]> => [],
  keyField: 'id',
  labelField: 'name',
})
const mappedResult: Promise<DictionaryOption<User, 'id', 'name'>[]> =
  getMapped.getResult()
const mappedMap: Promise<Record<string, string>> = getMapped.getMap()

const group = factory.cacheGroup({
  user: request,
  users: {
    request: async (): Promise<User[]> => [],
    keyField: 'id',
    labelField: 'name',
  },
})
const groupedUser: Promise<User> = group.user.getResult(1)
const groupedUsers: Promise<DictionaryOption<User, 'id', 'name'>[]> =
  group.users.getResult()

const useVueUser = createVueCacheScope().cache(request)
const vueResult: VueCacheResult<User> = useVueUser.useEntry(1)
const useStandaloneVueUser = createVueUseCache(request)
const standaloneVueResult: VueCacheResult<User> = useStandaloneVueUser(1)
const useReactUser = createReactCacheScope().cache(request)
const reactResult: ReactCacheResult<User> = useReactUser.useEntry(1)
const useStandaloneReactUser = createReactUseCache(request)
const standaloneReactResult: ReactCacheResult<User> = useStandaloneReactUser(1)

type UserParams = Expect<Equal<Parameters<typeof getUser.getResult>, [number]>>
type UserResult = Expect<Equal<ReturnType<typeof getUser.getResult>, Promise<User>>>
type MappedResult = Expect<
  Equal<
    ReturnType<typeof getMapped.getResult>,
    Promise<DictionaryOption<User, 'id', 'name'>[]>
  >
>
type VueUseParams = Expect<Equal<Parameters<typeof useStandaloneVueUser>, [number]>>
type ReactUseResult = Expect<
  Equal<ReturnType<typeof useStandaloneReactUser>, ReactCacheResult<User>>
>

// @ts-expect-error 请求参数应保持为 number
getUser.getResult('1')
// @ts-expect-error 请求结果不应退化为 any
const invalidUser: Promise<string> = getUser.getResult(1)
// @ts-expect-error 独立缓存应保留请求参数类型
createCache(request).getResult('1')
// @ts-expect-error 分组缓存应保留请求参数类型
group.user.getResult('1')
// @ts-expect-error Vue 快捷入口应保留请求参数类型
useStandaloneVueUser('1')
// @ts-expect-error React 快捷入口应保留请求参数类型
useStandaloneReactUser('1')

factory.clear('user')
factory.clearAll()

void namedFactory
void result
void user
void userData
void cachedUser
void mappedResult
void mappedMap
void groupedUser
void groupedUsers
void vueResult
void standaloneVueResult
void reactResult
void standaloneReactResult
