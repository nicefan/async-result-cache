import assert from 'node:assert/strict'
import test from 'node:test'

import createCache, { createCache as createNamedCache } from '../dist/index.js'

test('exports createCache as default and named API', () => {
  assert.equal(createCache, createNamedCache)
})

test('register reuses APIs and entries', async () => {
  const cache = createCache()
  let calls = 0
  const request = async (id) => {
    calls += 1
    return { id, name: `user-${id}` }
  }

  const getUser = cache.register(request)
  assert.equal(cache.register(request), getUser)

  const first = getUser(1)
  const second = getUser(1)
  const other = getUser(2)

  assert.equal(first, second)
  assert.notEqual(first, other)
  assert.deepEqual(await first.getResult(), { id: 1, name: 'user-1' })
  assert.deepEqual(await other.getResult(), { id: 2, name: 'user-2' })
  assert.equal(calls, 2)
})

test('entries deduplicate concurrent loads', async () => {
  const cache = createCache()
  let resolveRequest
  let calls = 0
  const getData = cache.register(() => {
    calls += 1
    return new Promise((resolve) => {
      resolveRequest = resolve
    })
  })

  const entry = getData()
  const first = entry.getResult()
  const second = entry.getResult()

  assert.equal(first, second)
  assert.equal(calls, 1)

  resolveRequest({ ok: true })
  assert.deepEqual(await first, { ok: true })
  assert.deepEqual(await entry.getResult(), { ok: true })
})

test('result and map snapshots are synchronous and stable after loading', async () => {
  const cache = createCache()
  const getItems = cache.register({
    request: async () => [{ id: 1, name: 'one' }],
    keyField: 'id',
    labelField: 'name',
  })
  const entry = getItems()

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
  const cache = createCache()
  const resolvers = []
  let calls = 0
  const entry = cache.register(() => {
    calls += 1
    return new Promise((resolve) => resolvers.push(resolve))
  })()

  const initial = entry.getResult()
  assert.equal(entry.reload(), initial)
  resolvers[0]({ value: 1 })
  assert.deepEqual(await initial, { value: 1 })

  const refreshed = entry.reload()
  assert.equal(entry.reload(), refreshed)
  assert.equal(calls, 2)
  resolvers[1]({ value: 2 })
  assert.deepEqual(await refreshed, { value: 2 })
})

test('failures reject and a failed reload preserves successful snapshots', async () => {
  const cache = createCache()
  const initialError = new Error('initial failure')
  let initialCalls = 0
  const failed = cache.register(async () => {
    initialCalls += 1
    throw initialError
  })()

  await assert.rejects(failed.getResult(), initialError)
  await assert.rejects(failed.getResult(), initialError)
  assert.equal(initialCalls, 1)

  const reloadError = new Error('reload failure')
  let reloadCalls = 0
  const entry = cache.register({
    request: async () => {
      reloadCalls += 1
      if (reloadCalls > 1) throw reloadError
      return [{ id: 1 }]
    },
    keyField: 'id',
  })()

  const result = await entry.getResult()
  const map = await entry.getMap()
  await assert.rejects(entry.reload(), reloadError)
  assert.equal(entry.result, result)
  assert.equal(entry.map, map)
  assert.equal(await entry.getResult(), result)
})

test('entry clear keeps identity and discards pending cache writes', async () => {
  const cache = createCache()
  const resolvers = []
  let calls = 0
  const getItems = cache.register({
    request: () => {
      calls += 1
      return new Promise((resolve) => resolvers.push(resolve))
    },
    keyField: 'id',
  })
  const entry = getItems()
  const staleResult = entry.getResult()
  const staleMap = entry.getMap()

  entry.clear()
  assert.equal(getItems(), entry)

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
  const cache = createCache()
  let userCalls = 0
  let roleCalls = 0
  const apis = cache.registerGroup({
    user: async (id) => ({ id, call: ++userCalls }),
    role: async (id) => ({ id, call: ++roleCalls }),
  })

  const user = apis.user(1)
  const role = apis.role(1)
  assert.deepEqual(await user.getResult(), { id: 1, call: 1 })
  assert.deepEqual(await role.getResult(), { id: 1, call: 1 })

  cache.clear('user')
  assert.equal(apis.user(1), user)
  assert.deepEqual(await user.getResult(), { id: 1, call: 2 })
  assert.equal(await role.getResult(), role.result)
  assert.equal(roleCalls, 1)

  cache.clearAll()
  assert.deepEqual(await user.getResult(), { id: 1, call: 3 })
  assert.deepEqual(await role.getResult(), { id: 1, call: 2 })
})

test('register rejects name conflicts', () => {
  const cache = createCache()
  cache.register({
    name: 'user',
    request: async ({ id }) => ({ id }),
  })

  assert.throws(
    () => cache.register({ name: 'user', request: async () => ({}) }),
    /Cache name already registered: user/
  )
})

test('getMap returns null-prototype maps and safely stores __proto__', async () => {
  const cache = createCache()
  const objectEntry = cache.register(async () => ({ id: 1 }))()
  const emptyEntry = cache.register(async () => [])()
  const protoEntry = cache.register({
    request: async () => [{ id: '__proto__', name: 'safe' }],
    keyField: 'id',
  })()

  const objectMap = await objectEntry.getMap()
  const emptyMap = await emptyEntry.getMap()
  const protoMap = await protoEntry.getMap()

  assert.equal(Object.getPrototypeOf(objectMap), null)
  assert.equal(Object.getPrototypeOf(emptyMap), null)
  assert.deepEqual(Object.keys(objectMap), [])
  assert.deepEqual(Object.keys(emptyMap), [])
  assert.equal(Object.hasOwn(protoMap, '__proto__'), true)
  assert.deepEqual(protoMap.__proto__, { id: '__proto__', name: 'safe' })
  assert.equal({}.polluted, undefined)
})
