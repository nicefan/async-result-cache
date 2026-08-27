# async-result-cache

轻量的异步结果缓存工具。核心入口无运行时依赖，可以按请求参数复用异步结果、合并并发请求、主动刷新缓存，并把列表结果转换为记录映射或字典映射；同时提供 Vue 和 React 响应式入口。

## 安装

```bash
pnpm add async-result-cache
```

包仅提供 ESM。使用 Vue 或 React 入口时，还需要在项目中安装对应框架；它们都是可选 peer dependency，不会影响核心入口。

## 创建缓存

`createCacheScope()` 创建一个独立的缓存作用域，用于统一注册和清理多组缓存：

```ts
import createCacheScope from 'async-result-cache'

const scope = createCacheScope()
```

### 注册请求

```ts
export const userCache = scope.cache(async (id: number) => {
  return fetch(`/api/users/${id}`).then((response) => response.json())
})

const user = await userCache.getResult(1)
```

相同请求参数会复用同一个缓存实例。参数通过 `JSON.stringify(args)` 生成缓存键，应使用 JSON 可序列化数据。首次读取新实例时立即开始请求。

不需要独立作用域时，可以使用 `createCache()` 在当前入口的默认作用域中创建缓存控制器：

```ts
import { createCache } from 'async-result-cache'

const userCache = createCache(async (id: number) => {
  return fetch(`/api/users/${id}`).then((response) => response.json())
})
```

多次使用同一个请求方法调用 `createCache()` 会复用默认作用域中的缓存数据。只有显式调用 `createCacheScope()` 才会创建相互隔离的作用域。

需要命名或生成映射时，可以传入配置对象：

```ts
export const usersCache = scope.cache({
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
export const caches = scope.cacheGroup({
  users: userApi.list,
  roles: roleApi.list,
})

const users = await caches.users.getResult()
```

分组对象的键会自动成为缓存名称，因此可以传给 `scope.clear(name)` 定向清理。

## 缓存控制器

`scope.cache()` 和 `createCache()` 返回缓存控制器，所有方法都按请求参数定位缓存实例：

- `getResult(...args)`：异步取得结果；合并正在进行的相同请求。
- `getMap(...args)`：异步取得列表映射。
- `get(...args)`：异步取得同一份缓存的 `{ result, map }`。
- `reload(...args)`：重新请求；已有请求进行中时复用该请求。
- `clear(...args)`：仅清理参数对应的已有实例；实例不存在时不执行操作。
- `useEntry(...args)`：取得缓存状态对象；在 Vue 和 React 中，请求成功或缓存清除会触发响应更新。

```ts
const result = await usersCache.getResult(companyId)
const map = await usersCache.getMap(companyId)
const data = await usersCache.get(companyId)

await usersCache.reload(companyId)
usersCache.clear(companyId)
```

### 缓存状态

`useEntry()` 返回的缓存状态对象包含以下属性和方法：

- `getResult()`：异步取得结果；合并正在进行的相同请求。
- `getMap()`：异步取得列表映射。
- `reload()`：重新请求；已有请求进行中时复用该请求。
- `clear()`：清理当前缓存；未完成请求的结果不会写回缓存。
- `result`：已有原始数据的同步结果快照，首次读取时按需转换。
- `map`：已有原始数据的同步映射快照，首次读取时按需生成。

请求失败时 `getResult()`、`getMap()` 和 `reload()` 会 reject。刷新失败不会清除最近一次成功的结果和映射。

## 数据映射

列表请求可以通过 `keyField` 和 `labelField` 生成映射，`labelField` 需要与 `keyField` 一起配置。假设原始数据为：

```ts
const users = [
  { id: 1, name: 'Alice' },
  { id: 2, name: 'Bob' },
]
```

仅配置 `keyField` 时，`result` 保持原始列表，`map` 按字段值保存原始对象：

```ts
const usersCache = createCache({
  request: async () => users,
  keyField: 'id',
})

await usersCache.getMap()
// { 1: { id: 1, name: 'Alice' }, 2: { id: 2, name: 'Bob' } }
```

同时配置 `keyField` 和 `labelField` 时，`result` 转换为字典选项，`map` 保存字段值到标签的映射：

```ts
const usersCache = createCache({
  request: async () => users,
  keyField: 'id',
  labelField: 'name',
})

await usersCache.getResult()
// [
//   { original: { id: 1, name: 'Alice' }, value: 1, label: 'Alice' },
//   { original: { id: 2, name: 'Bob' }, value: 2, label: 'Bob' },
// ]

await usersCache.getMap()
// { 1: 'Alice', 2: 'Bob' }
```

需要同时取得两者时，可以使用 `const { result, map } = await usersCache.get()`。

列表项本身包含 `value` 和 `label` 时，无需额外配置即可生成 `value -> label` 映射。映射键为 `null` 或 `undefined` 的数据会被忽略；键重复时，后面的数据会覆盖前面的数据。非列表结果和空列表返回空映射。

## 清理缓存

```ts
usersCache.clear(companyId) // 清理一组参数
scope.clear('users')         // 清理指定缓存的全部参数
scope.clearAll()             // 清理作用域内的所有缓存
```

控制器的 `clear(...args)` 只查找对应参数的已有实例，不会因为清理而创建实例。清理会保留实例身份并清空缓存数据，下次读取时重新请求。进行中的底层请求不会取消，但完成后不会重新写入缓存。

## Vue

Vue 入口的 `useEntry()` 可以在任意位置调用。在组件响应式环境中，请求成功或缓存清除会触发响应更新。

```ts
import createCacheScope from 'async-result-cache/vue'

const scope = createCacheScope()

export const deptCache = scope.cache({
  name: 'dept',
  request: deptApi.list,
  keyField: 'id',
})
```

只需要缓存状态入口时，可以使用默认作用域的快捷方法：

```ts
import { createUseCache } from 'async-result-cache/vue'

export const useDeptCache = createUseCache(deptApi.list)
```

在组件中调用时，可通过响应式状态对象更新获取异步请求结果：

```ts
const deptState = useDeptCache(companyId)
watch(() => deptState.result, (result) => {
  console.log(result)
})
await deptState.reload()
```

Vue 是可选 peer dependency，需要 Vue 3.3 或更高版本。

## React

React 入口的 `useEntry()` 是 Hook，请求成功或缓存清除会触发响应更新。控制器的其他方法可以在组件外调用：

```tsx
import createCacheScope from 'async-result-cache/react'

const scope = createCacheScope()

export const deptCache = scope.cache({
  name: 'dept',
  request: deptApi.list,
  keyField: 'id',
})

function DeptList({ companyId }) {
  // useEntry() 是 Hook，需要遵守 React Hooks 调用规则
  const deptState = deptCache.useEntry(companyId)

  deptState.result
  deptState.map
}
```

只需要 Hook 入口时，可以使用默认作用域的快捷方法：

```tsx
import { createUseCache } from 'async-result-cache/react'

export const useDeptCache = createUseCache(deptApi.list)
```

`useEntry()` 必须在组件或自定义 Hook 顶层调用。React 是可选 peer dependency，需要 React 18 或更高版本。

## 许可证

[MIT](./LICENSE)
