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

## 创建缓存代理 `createCache`

`createCache()` 将传入的请求方法包装为缓存请求代理方法。代理方法接收与原请求相同的参数，返回一个 `CacheEntry`缓存实例对象；使用相同参数重复调用时，则返回同一个缓存实例。

请求参数通过 `JSON.stringify(args)` 生成缓存键，应使用 JSON 可序列化数据。

可以直接传入请求方法：

```ts
import { createCache } from 'async-result-cache'

const getUser = createCache(async (id: number) => {
  return fetch(`/api/users/${id}`).then((response) => response.json())
})

const cache = getUser(1)
const user = await cache.getResult()
```

也可以传入配置对象，用于指定请求方法和映射字段：

```ts
const getUsers = createCache({
  request: userApi.list,
  keyField: 'id',
  labelField: 'name',
})
```

调用代理方法创建 `CacheEntry` 时会立即发起请求，无需先调用 `getResult()`。

**配置项**：
| 属性 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `request` | `(...args) => Promise<Raw>` | 是 | 异步请求 |
| `name` | `string` | 否 | 仅用于 `createCacheRegistry().register()` 注册缓存代理 |
| `keyField` | `string` | 否 | 记录映射或字典值字段 |
| `labelField` | `string` | 否 | 字典标签字段； |
| `store` | `object` | 否 | 保存缓存实例的对象，需要监听时使用 |
| `transform` | `(cache) => object` | 否 | 首次创建实例时执行转换,可使用代理器 `reactive` 等函数 |

> 指定 `keyField` 后，可通过 `getMap()` 方法获取以指定字段为键的映射对象。
> 同时配置 `keyField` 和 `labelField` 则将请求结果数组转换为`{ value, label,original }` 对象数组。
> 请求结果数组为 `{ value, label }` 结构时，`getMap()` 会自动生成 `value -> label` 映射，`getResult()` 仍返回原数组。


## 缓存实例对象 `CacheEntry`

调用缓存代理方法会得到一个 `CacheEntry`：

- `getResult()`：异步获取请求结果。已有结果时直接返回缓存；正在请求时等待同一个请求；请求失败时返回 rejected Promise。
- `reload()`：重新发起请求并返回刷新后的结果。如果已有请求正在进行，则等待该请求。
- `clear()`：清除当前结果、映射和错误。下次调用 `getResult()` 时会重新请求。
- `getMap()`：异步获取列表映射；支持配置映射字段，也能自动识别 `{ value, label }` 数组，无法映射时返回空对象。
- `result`：当前结果的同步快照。首次请求完成前为 `undefined`；读取它会触发异步取值，请求完成后更新。
- `map`：当前映射的同步快照。映射生成前为空对象；读取它会触发异步生成，完成后更新。
- `status`：当前状态。请求中为 `pending`，成功后为 `loaded`，失败后为 `error`，调用 `clear()` 后为 `ready`。
- `error`：最近一次请求的错误。开始新请求或调用 `clear()` 时会被清除。

请求失败时 Promise 会 reject；刷新失败不会清除最近一次成功的结果和映射。

## 集中管理缓存 `createCacheRegistry`

`createCacheRegistry()` 用于统一提供缓存容器和实例转换，并复用已注册的缓存工厂。

```ts
import { reactive } from 'vue'
import { createCacheRegistry } from 'async-result-cache'

//接入 Vue 响应式状态
const state = reactive({})
const registry = createCacheRegistry({
  store: state, // 自定义缓存容器
  transform: (entry) => reactive(entry), // 自定义转换函数
})

export const getUser = registry.register(userApi.getUser)
export const caches = registry.registerAll({
  users: userApi.list,
  roles: roleApi.list,
})

// 注册后的方法与 `createCache()` 返回的方法用法相同：
const user = await getUser(1).getResult()
const users = await caches.users().getResult()
```

`register()` 默认按请求函数引用复用工厂。请求函数引用不稳定时，可在配置中提供唯一的 `name`；同名配置以第一次注册的请求和映射字段为准。`name` 只标识工厂，不会让不同参数共用结果。

`registerAll()` 一次注册多个请求，每个方法拥有独立的参数缓存空间。

## 批量创建缓存 `createCaches`


只需一次批量创建、不需要 Registry 复用时，可使用 `createCaches()`：

```ts
import { createCaches } from 'async-result-cache'

const caches = createCaches({
  users: userApi.list,
  roles: userApi.roles,
})

const users = await caches.users().getResult()
```

每次调用 `createCaches()` 都会创建一组新的缓存空间。


## 许可证

[MIT](./LICENSE)
