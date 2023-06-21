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
  private _result?: T;
  load: () => Promise<SyncData<T>>;
  constructor(request: Fn<Promise<any>>, param?: any);
  constructor(config: CacheParam, param?: any);
  constructor(config: Fn<Promise<any>> | CacheParam, param?: any) {
    let status: SyncData<T>["status"] = "ready";
    let delay = false;
    let _promise: Promise<SyncData<T>>;
    const _config: CacheParam = typeof config === "function" ? { request: config } : config;
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
      .then(({ res, keyField = "value", labelField }) => {
        // 取值时进行赋值，被vue代理时this对象为代理对象，可监测数据变化，在构造时this为原始对象，赋值不会响应。
        if (labelField) {
          this._result = res?.map((item) => ({
            id: item.id,
            value: item[keyField] ?? item.id,
            label: [],
          }));
        } else {
          this._result = res;
        }
        return res;
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

  get map() {
    this.getMap();
    return this._map || ({} as DictMap<T>);
  }
}

type GetRequest<T extends Fn | CacheParam> = T extends { request: infer P } ? P : T;
type RequestReturn<T extends Fn | CacheParam> = ReturnType<GetRequest<T>> extends Promise<infer R>
  ? NonNullable<R>
  : never;
type RequestParam<T extends Fn | CacheParam> = Parameters<GetRequest<T>>;

type CacheConfig<T extends Obj, P extends any[]> = {
  store?: Obj;
  transform?: (data: CacheResult<T>) => Obj;
} & CacheParam<T, P>;

export function createCache<T extends Obj, P extends any[]>(
  api: CacheConfig<T, P> | ((...args: P) => Promise<T>)
) {
  const config = typeof api === "function" ? { request: api } : api;
  const { store = {}, transform, request, keyField, labelField } = config;

  const getData = (...args: P): CacheResult<T> => {
    const key = JSON.stringify(args.join() || "default");
    let cache = Reflect.get(store, key);
    if (!cache) {
      const payload = args[0];
      cache = new CacheResult({ request, keyField, labelField }, payload);
      if (transform) cache = transform(cache);
      Reflect.set(store, key, cache);
    }
    return cache;
  };
  return getData;
}

type CacheStoreConfig = {
  store?: Obj;
  transform?: (data: CacheResult) => Obj;
};

function registBache<T extends Obj<Fn | CacheParam>>(
  apis: T,
  config: CacheStoreConfig = {}
) {
  const { store = {}, transform } = config;

  const methods: {
    [K in keyof T]: (...args: RequestParam<T[K]>) => CacheResult<RequestReturn<T[K]>>;
  } = {} as any;

  Object.keys(apis).forEach((key) => {
    const data = (store[key] = {});
    const api = apis[key];
    const config = typeof api === "function" ? { request: api } : api;
    methods[key as keyof T] = createCache({
      store: data,
      transform,
      ...config,
    }) as any;
  });
  return methods;
}

export function createCacheStore(config: CacheStoreConfig) {
  const { store = {}, transform } = config;
  const apisMap = new Map();
  return {
    produceBache: <T extends Obj<Fn | CacheParam>>(apis: T) => registBache(apis, { store, transform }),
    produce: <T extends Obj, P extends any[]>(api: CacheParam<T, P> | CacheParam<T, P>["request"]) => {
      const { request, keyField, labelField }: CacheParam = typeof api === "function" ? { request: api } : api;
      let method: (...args: P) => CacheResult<T>;
      if (apisMap.has(request)) {
        method = apisMap.get(request);
      } else {
        method = createCache<T, P>({
          store,
          transform,
          request,
          labelField,
          keyField,
        });
        apisMap.set(request, method);
      }
      return method;
    },
  };
}

function produce<T extends Obj<Fn | CacheParam>>(config: T) {
  const caches: {
    [K in keyof T]: (
      ...args: RequestParam<T[K]>
    ) => CacheResult<RequestReturn<T[K]>>;
  } = {} as any;

  Object.keys(config).forEach((key) => {
    caches[key as keyof T] = cacheProduce(config[key]);
  });
  return caches;
}

function cacheProduce<T extends Obj, P extends any[]>(api: CacheParam<T, P> | ((...arg: P) => Promise<T>)) {
  const config = typeof api === "function" ? { request: api } : api;
  return (...args: P): CacheResult<T> => {
    const payload = args[0];
    return new CacheResult(config, payload);
  };
}
