# async-result-cache

独立、无运行时依赖的异步结果缓存工具。它可以按请求参数复用异步结果、合并并发请求、主动刷新缓存，并把列表结果转换为记录映射或字典映射。

## 安装

```bash
pnpm add async-result-cache
```

## 创建缓存

`createCache()` 创建一个统一的缓存注册器：

```ts
import createCache from 'async-result-cache'

const cache = createCache()
```

### 注册请求

```ts
export const getUser = cache.register(async (id: number) => {
  return fetch(`/api/users/${id}`).then((response) => response.json())
})

const userCache = getUser(1)
const user = await userCache.getResult()
```

相同请求参数会返回同一个缓存条目。参数通过 `JSON.stringify(args)` 生成缓存键，应使用 JSON 可序列化数据。取得新条目时立即开始请求。

需要命名或生成映射时，可以传入配置对象：

```ts
export const getUsers = cache.register({
  name: 'users',
  request: userApi.list,
  keyField: 'id',
  labelField: 'name',
})
```

| 属性 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `request` | `(...args) => Promise<Raw>` | 是 | 异步请求 |
| `name` | `string` | 否 | 用于按名称清理缓存 |
| `keyField` | `string` | 否 | 记录映射或字典值字段 |
| `labelField` | `string` | 否 | 字典标签字段 |

### 批量注册

```ts
export const caches = cache.registerGroup({
  users: userApi.list,
  roles: roleApi.list,
})

const users = await caches.users().getResult()
```

分组对象的键会自动成为 API 名称。

## 缓存条目

注册后的方法返回缓存条目：

- `getResult()`：异步取得结果；合并正在进行的相同请求。
- `getMap()`：异步取得列表映射。
- `reload()`：重新请求；已有请求进行中时复用该请求。
- `clear()`：清理当前缓存；未完成请求的结果不会写回缓存。
- `result`：已有原始数据的同步结果快照，首次读取时按需转换。
- `map`：已有原始数据的同步映射快照，首次读取时按需生成。

同时配置 `keyField` 和 `labelField` 时，`result` 转换为 `{ original, value, label }[]`。仅配置 `keyField` 时，`map` 保存 `key -> item`；同时配置两个字段时，`map` 保存 `key -> label`。

请求失败时 `getResult()`、`getMap()` 和 `reload()` 会 reject。刷新失败不会清除最近一次成功的结果和映射。

## 清理缓存

```ts
getUser(1).clear()   // 清理一组参数
cache.clear('users') // 清理指定 API 的全部参数
cache.clearAll()     // 清理所有 API
```

清理会保留缓存条目身份并清空缓存数据。进行中的底层请求不会取消，但完成后不会重新写入缓存。

## 许可证

[MIT](./LICENSE)
