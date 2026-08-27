import assert from 'node:assert/strict'
import test from 'node:test'

import createCacheScope, {
  createCache,
  createCacheScope as createNamedCache,
} from '../dist/index.js'

test('exports createCacheScope as default and named API', () => {
  assert.equal(createCacheScope, createNamedCache)
})

test('createCache creates a standalone cache controller', async () => {
  let calls = 0
  const request = async (id) => {
    calls += 1
    return { id }
  }
  const userCache = createCache(request)
  const duplicate = createCache(request)

  assert.equal(userCache.useEntry(1), duplicate.useEntry(1))
  assert.deepEqual(await userCache.getResult(1), { id: 1 })
  assert.deepEqual(await userCache.get(1), {
    result: { id: 1 },
    map: Object.create(null),
  })
  assert.equal(calls, 1)

  userCache.clear(2)
  assert.equal(calls, 1)

  userCache.clear(1)
  assert.deepEqual(await userCache.getResult(1), { id: 1 })
  assert.equal(calls, 2)
})

test('cache controllers reuse entries', async () => {
  const cache = createCacheScope()
  let calls = 0
  const request = async (id) => {
    calls += 1
    return { id, name: `user-${id}` }
  }

  const getUser = cache.cache(request)
  const duplicate = cache.cache(request)

  const first = getUser.useEntry(1)
  const second = duplicate.useEntry(1)
  const other = getUser.useEntry(2)

  assert.equal(first, second)
  assert.notEqual(first, other)
  assert.equal(first.constructor, Object)
  assert.equal(Object.isFrozen(first), true)
  assert.equal('_cachedData' in first, false)
  assert.deepEqual(await first.getResult(), { id: 1, name: 'user-1' })
  assert.deepEqual(await other.getResult(), { id: 2, name: 'user-2' })
  assert.equal(calls, 2)
})

test('entries expose data subscriptions with explicit cleanup', async () => {
  const cache = createCacheScope()
  let resolveRequest
  const entry = cache.cache(
    () => new Promise((resolve) => {
      resolveRequest = resolve
    })
  ).useEntry()
  let updates = 0
  const unsubscribe = entry.subscribe(() => {
    updates += 1
  })

  resolveRequest({ ok: true })
  await entry.getResult()
  assert.equal(updates, 1)

  entry.clear()
  assert.equal(updates, 2)

  unsubscribe()
  entry.clear()
  assert.equal(updates, 2)
})

test('entries deduplicate concurrent loads', async () => {
  const cache = createCacheScope()
  let resolveRequest
  let calls = 0
  const getData = cache.cache(() => {
    calls += 1
    return new Promise((resolve) => {
      resolveRequest = resolve
    })
  })

  const entry = getData.useEntry()
  const first = entry.getResult()
  const second = entry.getResult()

  assert.equal(first, second)
  assert.equal(calls, 1)

  resolveRequest({ ok: true })
  assert.deepEqual(await first, { ok: true })
  assert.deepEqual(await entry.getResult(), { ok: true })
})

test('result and map snapshots are synchronous and stable after loading', async () => {
  const cache = createCacheScope()
  const getItems = cache.cache({
    request: async () => [{ id: 1, name: 'one' }],
    keyField: 'id',
    labelField: 'name',
  })
  const entry = getItems.useEntry()

  await new Promise((resolve) => setImmediate(resolve))

  const result = entry.result
  const map = entry.map
  assert.deepEqual(result, [
    {
      original: { id: 1, name: 'one' },
      value: 1,
      label: 'one',
    },
  ])
  assert.deepEqual(map, Object.assign(Object.create(null), { 1: 'one' }))
  assert.equal(entry.result, result)
  assert.equal(entry.map, map)
})

test('reload starts a new request after settlement and merges active requests', async () => {
  const cache = createCacheScope()
  const resolvers = []
  let calls = 0
  const dataCache = cache.cache(() => {
    calls += 1
    return new Promise((resolve) => resolvers.push(resolve))
  })

  const initial = dataCache.getResult()
  assert.equal(dataCache.reload(), initial)
  resolvers[0]({ value: 1 })
  assert.deepEqual(await initial, { value: 1 })

  const refreshed = dataCache.reload()
  assert.equal(dataCache.reload(), refreshed)
  assert.equal(calls, 2)
  resolvers[1]({ value: 2 })
  assert.deepEqual(await refreshed, { value: 2 })
})

test('failures reject and a failed reload preserves successful snapshots', async () => {
  const cache = createCacheScope()
  const initialError = new Error('initial failure')
  let initialCalls = 0
  const failed = cache.cache(async () => {
    initialCalls += 1
    throw initialError
  }).useEntry()

  await assert.rejects(failed.getResult(), initialError)
  await assert.rejects(failed.getResult(), initialError)
  assert.equal(initialCalls, 1)

  const reloadError = new Error('reload failure')
  let reloadCalls = 0
  const entry = cache.cache({
    request: async () => {
      reloadCalls += 1
      if (reloadCalls > 1) throw reloadError
      return [{ id: 1 }]
    },
    keyField: 'id',
  }).useEntry()

  const result = await entry.getResult()
  const map = await entry.getMap()
  await assert.rejects(entry.reload(), reloadError)
  assert.equal(entry.result, result)
  assert.equal(entry.map, map)
  assert.equal(await entry.getResult(), result)
})

test('entry clear keeps identity and discards pending cache writes', async () => {
  const cache = createCacheScope()
  const resolvers = []
  let calls = 0
  const getItems = cache.cache({
    request: () => {
      calls += 1
      return new Promise((resolve) => resolvers.push(resolve))
    },
    keyField: 'id',
  })
  const entry = getItems.useEntry()
  const staleResult = entry.getResult()
  const staleMap = entry.getMap()

  getItems.clear()
  assert.equal(getItems.useEntry(), entry)

  const currentResult = entry.getResult()
  const currentMap = entry.getMap()
  assert.equal(calls, 2)

  resolvers[1]([{ id: 'new' }])
  assert.deepEqual(await currentResult, [{ id: 'new' }])
  assert.deepEqual(
    await currentMap,
    Object.assign(Object.create(null), { new: { id: 'new' } })
  )

  resolvers[0]([{ id: 'old' }])
  await staleResult
  await staleMap
  assert.deepEqual(entry.result, [{ id: 'new' }])
  assert.deepEqual(
    entry.map,
    Object.assign(Object.create(null), { new: { id: 'new' } })
  )
})

test('factory clear invalidates one named API and clearAll invalidates every API', async () => {
  const cache = createCacheScope()
  let userCalls = 0
  let roleCalls = 0
  const apis = cache.cacheGroup({
    user: async (id) => ({ id, call: ++userCalls }),
    role: async (id) => ({ id, call: ++roleCalls }),
  })

  const user = apis.user.useEntry(1)
  const role = apis.role.useEntry(1)
  assert.deepEqual(await user.getResult(), { id: 1, call: 1 })
  assert.deepEqual(await role.getResult(), { id: 1, call: 1 })

  cache.clear('user')
  assert.equal(apis.user.useEntry(1), user)
  assert.deepEqual(await user.getResult(), { id: 1, call: 2 })
  assert.equal(await role.getResult(), role.result)
  assert.equal(roleCalls, 1)

  cache.clearAll()
  assert.deepEqual(await user.getResult(), { id: 1, call: 3 })
  assert.deepEqual(await role.getResult(), { id: 1, call: 2 })
})

test('cache uses name as the cache key', () => {
  const cache = createCacheScope()
  const first = cache.cache({
    name: 'user',
    request: async ({ id }) => ({ id }),
  })
  const second = cache.cache({
    name: 'user',
    request: async () => ({ id: 2 }),
  })

  assert.equal(first.useEntry({ id: 1 }), second.useEntry({ id: 1 }))
})

test('getMap returns null-prototype maps and safely stores __proto__', async () => {
  const cache = createCacheScope()
  const objectCache = cache.cache(async () => ({ id: 1 }))
  const emptyCache = cache.cache(async () => [])
  const protoCache = cache.cache({
    request: async () => [{ id: '__proto__', name: 'safe' }],
    keyField: 'id',
  })

  const objectMap = await objectCache.getMap()
  const emptyMap = await emptyCache.getMap()
  const protoMap = await protoCache.getMap()

  assert.equal(Object.getPrototypeOf(objectMap), null)
  assert.equal(Object.getPrototypeOf(emptyMap), null)
  assert.deepEqual(Object.keys(objectMap), [])
  assert.deepEqual(Object.keys(emptyMap), [])
  assert.equal(Object.hasOwn(protoMap, '__proto__'), true)
  assert.deepEqual(protoMap.__proto__, { id: '__proto__', name: 'safe' })
  assert.equal({}.polluted, undefined)
})
