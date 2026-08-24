# async-result-cache

独立、无运行时依赖的异步结果缓存工具。它可以按请求参数复用异步结果、合并并发请求、主动刷新缓存，并把列表结果转换为记录映射或字典映射。

该模块从 [`api-datamodel`](https://github.com/nicefan/api-datamodel) 的 `dataCache` 模块拆分而来，并保留原模块的 Git 历史。

## 安装

```bash
pnpm add async-result-cache
```

也可使用 npm 或 yarn：

```bash
npm install async-result-cache
yarn add async-result-cache
```

## 缓存异步结果

```ts
import { createCache } from 'async-result-cache'

const getUser = createCache(async (id: number) => {
  return fetch(`/api/users/${id}`).then((response) => response.json())
})

const cache = getUser(1)

// 相同参数返回同一个 CacheResult，请求只执行一次。
getUser(1) === cache

const user = await cache.getResult()
await cache.reload()
```

`CacheResult` 在创建时开始加载。`getResult()` 返回异步结果；`result` 返回当前缓存值并触发异步读取，更适合由 Vue 等响应式系统代理后使用。

## 记录映射

配置 `keyField` 后，可把记录数组转换为以指定字段为键的映射：

```ts
const getDepartments = createCache({
  request: async () => departmentApi.list(),
  keyField: 'id',
})

const departmentMap = await getDepartments().getMap()
// departmentMap[100] 为完整部门记录。
```

## 字典映射

标准的 `{ value, label }` 数组可以直接转换为字典映射。字段名称不同时，同时配置 `keyField` 和 `labelField`：

```ts
const getStatuses = createCache({
  request: async () => statusApi.list(),
  keyField: 'code',
  labelField: 'name',
})

const cache = getStatuses()
const statusMap = await cache.getMap()
const options = await cache.getResult()
```

此时 `statusMap` 为 `code -> name`，`options` 会转换为：

```ts
[
  {
    original: { code: 'enabled', name: '启用' },
    value: 'enabled',
    label: '启用',
  },
]
```

## 集中管理缓存

```ts
import { createCacheStore } from 'async-result-cache'

const cacheStore = createCacheStore({})

export const getUser = cacheStore.produce(userApi.getUser)
export const caches = cacheStore.produceBatch({
  users: userApi.list,
  roles: roleApi.list,
})
```

`produce()` 会按请求函数或显式 `name` 复用缓存工厂；`produceBatch()` 为一组异步方法分别创建缓存空间。

## 自定义 Store 和转换

```ts
const state = reactive({})
const cacheStore = createCacheStore({
  store: state,
  transform(cache) {
    return reactive(cache)
  },
})
```

包本身不依赖 Vue 或其他状态管理库，`store` 和 `transform` 由使用方决定。

## API

| API | 作用 |
| --- | --- |
| `CacheResult` | 管理单个异步结果的加载、读取、刷新和映射 |
| `createCache` | 按参数创建并复用 `CacheResult` |
| `createCacheStore` | 创建共享 Store，并提供 `produce`、`produceBatch` |
| `registBatch` | 一次注册多个异步缓存方法；名称为兼容原 API 而保留 |

## 许可证

[MIT](./LICENSE)
