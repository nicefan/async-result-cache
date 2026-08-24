import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CacheEntry,
  createCache,
  createCacheRegistry,
  createCaches,
} from '../dist/index.js'

test('createCache reuses results with the same arguments', async () => {
  let calls = 0
  const getUser = createCache(async (id) => {
    calls += 1
    return { id, name: `user-${id}` }
  })

  const first = getUser(1)
  const second = getUser(1)
  const other = getUser(2)

  assert.equal(first, second)
  assert.notEqual(first, other)
  assert.deepEqual(await first.getResult(), { id: 1, name: 'user-1' })
  assert.deepEqual(await other.getResult(), { id: 2, name: 'user-2' })
  assert.equal(calls, 2)
})

test('CacheEntry deduplicates concurrent loads', async () => {
  let resolveRequest
  let calls = 0
  const cache = new CacheEntry(() => {
    calls += 1
    return new Promise((resolve) => {
      resolveRequest = resolve
    })
  })

  const first = cache.getResult()
  const second = cache.getResult()
  assert.equal(first, second)
  assert.equal(calls, 1)

  resolveRequest({ ok: true })
  assert.deepEqual(await first, { ok: true })
  assert.deepEqual(await cache.getResult(), { ok: true })
})

test('reload starts a fresh request immediately after the previous request settles', async () => {
  let calls = 0
  const cache = new CacheEntry(async () => ({ value: ++calls }))

  const initial = cache.getResult()
  assert.deepEqual(await initial, { value: 1 })

  const refreshed = cache.reload()
  assert.notEqual(refreshed, initial)
  assert.equal(calls, 2)
  assert.deepEqual(await refreshed, { value: 2 })
})

test('reload only merges requests that are still in progress', async () => {
  const resolvers = []
  let calls = 0
  const cache = new CacheEntry(() => {
    calls += 1
    return new Promise((resolve) => resolvers.push(resolve))
  })

  const initial = cache.getResult()
  assert.equal(cache.reload(), initial)
  assert.equal(calls, 1)

  resolvers[0]({ value: 1 })
  await initial

  const refreshed = cache.reload()
  assert.equal(cache.reload(), refreshed)
  assert.equal(calls, 2)
  resolvers[1]({ value: 2 })
  assert.deepEqual(await refreshed, { value: 2 })
})

test('an initial failure rejects without an implicit retry', async () => {
  const expected = new Error('initial request failed')
  let calls = 0
  const cache = new CacheEntry(async () => {
    calls += 1
    throw expected
  })

  await assert.rejects(cache.getResult(), expected)
  assert.equal(cache.status, 'error')
  assert.equal(cache.error, expected)
  assert.equal(calls, 1)

  await assert.rejects(cache.getResult(), expected)
  assert.equal(calls, 1)
})

test('a failed reload preserves the last successful result and map', async () => {
  const expected = new Error('refresh failed')
  let calls = 0
  const cache = new CacheEntry({
    request: async () => {
      calls += 1
      if (calls > 1) throw expected
      return [{ id: 1, name: 'cached' }]
    },
    keyField: 'id',
  })

  const result = await cache.getResult()
  const map = await cache.getMap()
  await assert.rejects(cache.reload(), expected)

  assert.equal(cache.status, 'error')
  assert.equal(cache.error, expected)
  assert.equal(cache.result, result)
  assert.equal(cache.map, map)
  assert.equal(await cache.getResult(), result)
  assert.equal(calls, 2)
})

test('clear invalidates pending result and map writes without cancelling callers', async () => {
  const resolvers = []
  let calls = 0
  const cache = new CacheEntry({
    request: () => {
      calls += 1
      return new Promise((resolve) => resolvers.push(resolve))
    },
    keyField: 'id',
  })

  const staleResult = cache.getResult()
  const staleMap = cache.getMap()
  cache.clear()

  const currentResult = cache.getResult()
  const currentMap = cache.getMap()
  assert.equal(calls, 2)

  resolvers[1]([{ id: 'new' }])
  assert.deepEqual(await currentResult, [{ id: 'new' }])
  assert.deepEqual(
    await currentMap,
    Object.assign(Object.create(null), { new: { id: 'new' } })
  )

  resolvers[0]([{ id: 'old' }])
  assert.deepEqual(await staleResult, [{ id: 'old' }])
  await staleMap

  assert.deepEqual(cache.result, [{ id: 'new' }])
  assert.deepEqual(
    cache.map,
    Object.assign(Object.create(null), { new: { id: 'new' } })
  )
})

test('getMap builds record and dictionary mappings', async () => {
  const records = createCache({
    request: async () => [
      { id: 1, name: 'one' },
      { id: 2, name: 'two' },
    ],
    keyField: 'id',
  })()
  const dictionary = createCache({
    request: async () => [
      { code: 'on', title: 'Enabled' },
      { code: 'off', title: 'Disabled' },
    ],
    keyField: 'code',
    labelField: 'title',
  })()

  assert.deepEqual(await records.getMap(), Object.assign(Object.create(null), {
    1: { id: 1, name: 'one' },
    2: { id: 2, name: 'two' },
  }))
  assert.deepEqual(await dictionary.getMap(), Object.assign(Object.create(null), {
    on: 'Enabled',
    off: 'Disabled',
  }))
  assert.deepEqual(await dictionary.getResult(), [
    {
      original: { code: 'on', title: 'Enabled' },
      value: 'on',
      label: 'Enabled',
    },
    {
      original: { code: 'off', title: 'Disabled' },
      value: 'off',
      label: 'Disabled',
    },
  ])
})

test('getMap returns safe empty maps for unsupported and empty results', async () => {
  const objectResult = new CacheEntry(async () => ({ id: 1 }))
  const emptyResult = new CacheEntry(async () => [])

  const objectMap = await objectResult.getMap()
  const emptyMap = await emptyResult.getMap()

  assert.equal(Object.getPrototypeOf(objectMap), null)
  assert.equal(Object.getPrototypeOf(emptyMap), null)
  assert.deepEqual(Object.keys(objectMap), [])
  assert.deepEqual(Object.keys(emptyMap), [])
})

test('getMap safely stores __proto__ as an own key', async () => {
  const cache = createCache({
    request: async () => [{ id: '__proto__', name: 'safe' }],
    keyField: 'id',
  })()

  const map = await cache.getMap()
  assert.equal(Object.getPrototypeOf(map), null)
  assert.equal(Object.hasOwn(map, '__proto__'), true)
  assert.deepEqual(map.__proto__, { id: '__proto__', name: 'safe' })
  assert.equal({}.polluted, undefined)
})

test('createCaches and createCacheRegistry isolate request stores', async () => {
  const batch = createCaches({
    user: async (id) => ({ id }),
    roles: async () => [{ value: 'admin', label: 'Admin' }],
  })

  assert.deepEqual(await batch.user(7).getResult(), { id: 7 })
  assert.deepEqual(
    await batch.roles().getMap(),
    Object.assign(Object.create(null), { admin: 'Admin' })
  )

  const registry = createCacheRegistry({})
  const request = async (id) => ({ id })
  const firstFactory = registry.register(request)
  const secondFactory = registry.register(request)

  assert.equal(firstFactory, secondFactory)
  assert.equal(firstFactory(1), secondFactory(1))
})
