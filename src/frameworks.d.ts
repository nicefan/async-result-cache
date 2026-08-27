declare module 'vue' {
  export interface ShallowRef<T = unknown> {
    value: T
  }

  export function getCurrentScope(): object | undefined
  export function onScopeDispose(cleanup: () => void): void
  export function shallowRef<T = undefined>(value?: T): ShallowRef<T>
  export function triggerRef(ref: ShallowRef): void
}

declare module 'react' {
  export function useCallback<T extends (...args: any[]) => any>(callback: T, deps: readonly unknown[]): T
  export function useSyncExternalStore<T>(
    subscribe: (listener: () => void) => () => void,
    getSnapshot: () => T,
    getServerSnapshot?: () => T
  ): T
}
