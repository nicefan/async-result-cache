import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CacheResult,
  createCache,
  createCacheStore,
  registBatch,
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

test('CacheResult deduplicates concurrent loads', async () => {
  let resolveRequest
  let calls = 0
  const cache = new CacheResult(() => {
    calls += 1
    return new Promise((resolve) => {
      resolveRequest = resolve
    })
  })

  const first = cache.load()
  const second = cache.load()
  assert.equal(first, second)
  assert.equal(calls, 1)

  resolveRequest({ ok: true })
  assert.equal((await first).status, 'loaded')
  assert.deepEqual(await cache.getResult(), { ok: true })
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

  assert.deepEqual(await records.getMap(), {
    1: { id: 1, name: 'one' },
    2: { id: 2, name: 'two' },
  })
  assert.deepEqual(await dictionary.getMap(), {
    on: 'Enabled',
    off: 'Disabled',
  })
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

test('registBatch and createCacheStore isolate request stores', async () => {
  const batch = registBatch({
    user: async (id) => ({ id }),
    roles: async () => [{ value: 'admin', label: 'Admin' }],
  })

  assert.deepEqual(await batch.user(7).getResult(), { id: 7 })
  assert.deepEqual(await batch.roles().getMap(), { admin: 'Admin' })

  const store = createCacheStore({})
  const request = async (id) => ({ id })
  const firstFactory = store.produce(request)
  const secondFactory = store.produce(request)

  assert.equal(firstFactory, secondFactory)
  assert.equal(firstFactory(1), secondFactory(1))
})
