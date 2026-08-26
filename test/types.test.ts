import createCache, {
  createCache as createNamedCache,
  type CacheFactory,
  type CacheOptions,
  type CacheResult,
  type DictionaryOption,
} from '../src/index'

type User = { id: number; name: string }

const factory: CacheFactory = createCache()
const namedFactory: CacheFactory = createNamedCache()
const request = async (id: number): Promise<User> => ({ id, name: String(id) })
const options: CacheOptions<User, [number]> = { request }
const getUser = factory.register(options)
const result: CacheResult<User> = getUser(1)

const getMapped = factory.register({
  request: async (): Promise<User[]> => [],
  keyField: 'id',
  labelField: 'name',
})
const mappedResult: Promise<DictionaryOption<User, 'id', 'name'>[]> =
  getMapped().getResult()
const mappedMap: Promise<Record<string, string>> = getMapped().getMap()

const group = factory.registerGroup({
  user: request,
  users: {
    request: async (): Promise<User[]> => [],
    keyField: 'id',
    labelField: 'name',
  },
})
const groupedUser: Promise<User> = group.user(1).getResult()
const groupedUsers: Promise<DictionaryOption<User, 'id', 'name'>[]> =
  group.users().getResult()

factory.clear('user')
factory.clearAll()

void namedFactory
void result
void mappedResult
void mappedMap
void groupedUser
void groupedUsers
