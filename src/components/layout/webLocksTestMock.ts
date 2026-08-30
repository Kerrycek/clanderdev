import { vi } from 'vitest';

export function installSerialWebLocks() {
  type Waiter = {
    callback: (lock: Lock | null) => unknown;
    resolve: (value: unknown) => void;
    reject: (error: unknown) => void;
  };
  const states = new Map<string, { active?: symbol; queue: Waiter[] }>();
  const drain = (name: string) => {
    const state = states.get(name);
    if (!state || state.active || state.queue.length === 0) return;
    const waiter = state.queue.shift()!;
    const token = Symbol(name);
    state.active = token;
    Promise.resolve().then(() => waiter.callback({ name, mode: 'exclusive' } as Lock)).then(
      waiter.resolve,
      waiter.reject
    ).finally(() => {
      if (state.active === token) state.active = undefined;
      drain(name);
    });
  };
  const request = vi.fn(<T,>(
    name: string,
    optionsOrCallback: LockOptions | ((lock: Lock | null) => T | PromiseLike<T>),
    maybeCallback?: (lock: Lock | null) => T | PromiseLike<T>
  ): Promise<T> => {
    const options = typeof optionsOrCallback === 'function' ? undefined : optionsOrCallback;
    const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback!;
    const state = states.get(name) ?? { queue: [] };
    states.set(name, state);
    if (options?.ifAvailable && state.active) return Promise.resolve(callback(null));
    return new Promise<T>((resolve, reject) => {
      state.queue.push({ callback, resolve: resolve as (value: unknown) => void, reject });
      drain(name);
    });
  });
  const crashAll = () => {
    for (const [name, state] of states) {
      state.active = undefined;
      drain(name);
    }
  };
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } });
  return { request, crashAll };
}
