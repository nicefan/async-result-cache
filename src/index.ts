// 用户数据缓存
const store: Map<string, CacheResult> = new Map();

/** 请求并缓存数据 */
export function getDataCache<T extends Obj = Obj>(
  name: string,
  request: (name: string) => Promise<T[]>,
  keyField?: string
) {
  let cache = store.get(name) as CacheResult<T>;
  if (!cache) {
    cache = new CacheResult<T>({ request, keyField }, name);
    store.set(name, cache);
  }
  return cache;
}

/** 清理缓存，刷新数据, */
export function clearDataCache(name: string) {
  store.delete(name);
}

export function clearAllCache() {
  store.clear();
}

type DataType = "dict" | "record" | void;
function checkType(item?: Obj, key?: string, labelField?: string): DataType {
  if (typeof item === "object") {
    return (key && labelField) || ("value" in item && "label" in item)
      ? "dict"
      : key && key in item
      ? "record"
      : undefined;
  }
}

function buildMap(list, keyField?: string, labelField?: string) {
  const dataType = checkType(list?.[0], keyField, labelField);
  if (dataType && list.length > 0) {
    const map: Obj = {};
    for (const item of list) {
      if (dataType === "record") {
        const key = keyField || "id";
        if (item[key]) map[key] = item;
      } else if (dataType === "dict") {
        const key = item[keyField || "value"];
        const label = item[labelField || "label"];
        map[key] = label;
      }
    }
    return map;
  }
}

type CacheParam<T = any, P extends any[] = any> = {
  request: (...args: P) => Promise<T>;
  keyField?: string;
  labelField?: string;
};

interface SyncData<T> {
  reload: () => Promise<SyncData<T>>;
  status: "ready" | "pending" | "loaded" | "error";
  res?: T;
  keyField?: string;
  labelField?: string;
}
type DictMap<T> = T extends any[]
  ? Record<string, T[0] extends { value: any; label: string } ? string : T[0]>
  : T;
export class CacheResult<T extends Obj | Obj[] = Obj> {
  private _map?: DictMap<T>;
  // private _promise!: Promise<SyncData<T>>;
  private _result?: T;
  load: () => Promise<SyncData<T>>;
  constructor(request: Fn<Promise<any>>, param?: any);
  constructor(config: CacheParam, param?: any);
  constructor(config: Fn<Promise<any>> | CacheParam, param?: any) {
    let status: SyncData<T>["status"] = "ready";
    let delay = false;
    let _promise: Promise<SyncData<T>>;
    const _config: CacheParam =
      typeof config === "function" ? { request: config } : config;
    const { request, keyField, labelField } = _config;
    const reload = () => {
      status = "ready";
      return delay ? _promise : this.load();
    };
    this.load = () => {
      if (status !== "ready") return _promise;
      status = "pending";
      delay = true;
      return (_promise = request(param)
        .then((res) => {
          status = "loaded";
          const info = {
            status,
            res,
            keyField,
            labelField,
            reload,
          };
          return info;
        })
        .catch((err) => {
          status = "error";
          return { status, reload };
        })).finally(() => {
        setTimeout(() => {
          delay = false;
        }, 1000);
      });
    };
    this.load();
  }

  reload() {
    return this.load().then(({ reload }) => {
      return reload().then((result) => {
        if (result.status === "loaded") {
          this._result = result.res;
          if (this._map) this.getMap();
        }
        return result;
      });
    });
  }

  getResult() {
    return this.load()
      .then((result) => (result.status === "error" ? this.reload() : result))
      .then(({ res }) => {
        // 取值时进行赋值，被vue代理时this对象为代理对象，可监测数据变化，在构造时this为原始对象，赋值不会响应。
        this._result = res;
        return res ;
      });
  }

  get result() {
    this.getResult();
    return this._result;
  }

  getMap() {
    return this.load().then(({ res = [], keyField, labelField }) => {
      if (!this._map) {
        return (this._map = buildMap(res, keyField, labelField) as DictMap<T>);
      }
      return this._map || {};
    });
  }

  get map()  {
    this.getMap();
    return this._map || {} as DictMap<T>;
  }
}

type RequestReturn<T extends Fn | CacheParam> = ReturnType<
  T extends { request: infer P } ? P : T
> extends Promise<infer R>
  ? R extends Obj[]
    ? R[0]
    : never
  : never;

interface BuildCache {
  <T extends Obj>(request: (name: string) => Promise<T[]>, store?: Obj): {
    store: { [key: string]: CacheResult<T> };
    getData: (name: string) => CacheResult<T>;
  };
  <T extends Obj<Fn | CacheParam>>(config: T, store?: Obj): {
    store: { [K in keyof T]: CacheResult<RequestReturn<T[K]>> };
    getData: {
      <K extends keyof Omit<T, "default">>(name: K): CacheResult<
        RequestReturn<T[K]>
      >;
      (name: string): CacheResult<RequestReturn<T["default"]>>;
    };
  };
}

export const buildCache: BuildCache = (
  config: Fn | Record<string, Fn | CacheParam>,
  _store: Obj = {}
) => {
  const _config = formatConfig(config);

  const getData = (name: string) => {
    let cache = Reflect.get(_store, name); //as CacheResult<T>
    if (!cache) {
      const item = _config[name] || _config.default;
      try {
        cache = new CacheResult(item, name);
        Reflect.set(_store, name, cache);
      } catch {
        Promise.reject(new Error(`无对应数据配置"${name}"`));
      }
    }
    return cache;
  };
  return {
    store: _store,
    getData,
  };
};

function formatConfig(config) {
  const _config: Obj<CacheParam> = {};
  if (typeof config === "function") {
    _config.default = { request: config };
  } else {
    Object.keys(config).forEach((key) => {
      const value = config[key];
      _config[key] = typeof value === "function" ? { request: value } : value;
    });
  }
  return _config;
}

export function createCacheStore(data: Obj = {}) {
  return {
    registApi<T extends Obj, P extends any[]>(
      api: CacheParam<T, P> | ((...arg: P) => Promise<T>)
    ) {
      const config = typeof api === "function" ? { request: api } : api;
      const key = Symbol("default");
      const store = (data[key as any] = {});

      const getData = (...args: P): CacheResult<T> => {
        const payload = args[0];
        const key = JSON.stringify(payload || "default");
        let cache = Reflect.get(store, key);
        if (!cache) {
          cache = new CacheResult(config, payload);
          Reflect.set(store, key, cache);
        }
        return cache;
      };
      return getData;
    },
  };
}
const api = () => Promise.resolve([{ value: "", label: "" }]);
const cs = createCacheStore();
const ca = cs.registApi(api);
const re = ca();
re.map;
