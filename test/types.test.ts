import {
  CacheResult,
  createCache,
  createCacheStore,
  registerBatch,
  type CacheParam,
} from '../src/index'

type User = { id: number; name: string }

const request = async (id: number): Promise<User> => ({ id, name: String(id) })
const param: CacheParam<User, [number]> = { request }
const cached = createCache(param)
const result: CacheResult<User> = cached(1)

const mapped = createCache({
  request: async (): Promise<User[]> => [],
  keyField: 'id',
  labelField: 'name',
})
mapped().getResult()

const batch = registerBatch({ request })
batch.request(1)

const store = createCacheStore({})
store.produce(request)(1)

void result
