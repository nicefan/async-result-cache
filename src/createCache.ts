import { CacheEntry } from './cacheResult'
import type {
  CacheFactory,
  CacheOptions,
  CacheResult,
  Fn,
  Obj,
} from './types'

type CacheApi = Fn<Promise<Obj>> | CacheOptions<Obj>

type Registration = {
  request: Fn<Promise<Obj>>
  cached: Fn<CacheResult>
  clear: () => void
}

function normalize(api: CacheApi): CacheOptions<Obj> {
  return typeof api === 'function' ? { request: api } : api
}

function createRegistration(options: CacheOptions<Obj>): Registration {
  const entries = new Map<string, CacheEntry>()

  const cached = (...args: any[]) => {
    const key = JSON.stringify(args)
    let entry = entries.get(key)
    if (!entry) {
      entry = new CacheEntry(options, ...args)
      entries.set(key, entry)
    }
    return entry
  }

  return {
    request: options.request,
    cached,
    clear: () => entries.forEach((entry) => entry.clear()),
  }
}

export function createCache(): CacheFactory {
  const registrations = new Set<Registration>()
  const registrationsByName = new Map<string, Registration>()
  const registrationsByRequest = new WeakMap<Fn, Registration>()

  const register = (api: CacheApi) => {
    const options = normalize(api)
    const existing = options.name
      ? registrationsByName.get(options.name)
      : registrationsByRequest.get(options.request)

    if (existing) {
      if (existing.request !== options.request) {
        throw new Error(`Cache name already registered: ${options.name}`)
      }
      return existing.cached
    }

    const registration = createRegistration(options)
    registrations.add(registration)
    if (!registrationsByRequest.has(options.request)) {
      registrationsByRequest.set(options.request, registration)
    }
    if (options.name) registrationsByName.set(options.name, registration)
    return registration.cached
  }

  const registerGroup = (apis: Record<string, CacheApi>) => {
    const cached: Record<string, Fn<CacheResult>> = Object.create(null)
    Object.keys(apis).forEach((name) => {
      const options = normalize(apis[name])
      cached[name] = register({ ...options, name })
    })
    return cached
  }

  return {
    register: register as CacheFactory['register'],
    registerGroup: registerGroup as CacheFactory['registerGroup'],
    clear(name: string) {
      registrationsByName.get(name)?.clear()
    },
    clearAll() {
      registrations.forEach((registration) => registration.clear())
    },
  }
}
