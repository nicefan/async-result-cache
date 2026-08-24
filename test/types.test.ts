import {
  CacheEntry,
  createCache,
  createCacheRegistry,
  createCaches,
  type CacheOptions,
  type DictionaryOption,
} from '../src/index'

type User = { id: number; name: string }

const request = async (id: number): Promise<User> => ({ id, name: String(id) })
const options: CacheOptions<User, [number]> = { request }
const cached = createCache(options)
const result: CacheEntry<User> = cached(1)

const mapped = createCache({
  request: async (): Promise<User[]> => [],
  keyField: 'id',
  labelField: 'name',
})
const mappedResult: Promise<DictionaryOption<User, 'id', 'name'>[]> = mapped().getResult()
const mappedReload: Promise<DictionaryOption<User, 'id', 'name'>[]> = mapped().reload()
const mappedMap: Promise<Record<string, string>> = mapped().getMap()
const objectMap: Promise<Record<PropertyKey, never>> = cached(1).getMap()

const batch = createCaches({ request })
batch.request(1)

const mappedBatch = createCaches({
  users: {
    request: async (): Promise<User[]> => [],
    keyField: 'id',
    labelField: 'name',
  },
})
const batchResult: Promise<DictionaryOption<User, 'id', 'name'>[]> =
  mappedBatch.users().getResult()

const registry = createCacheRegistry({})
registry.register(request)(1)
const registered = registry.register({
  request: async (): Promise<User[]> => [],
  keyField: 'id',
  labelField: 'name',
})
const producedResult: Promise<DictionaryOption<User, 'id', 'name'>[]> =
  registered().getResult()

void result
void mappedResult
void mappedReload
void mappedMap
void objectMap
void batchResult
void producedResult
