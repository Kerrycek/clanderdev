import type { User } from './users';
import { expectArray, haveApiCall } from './haveapi';

/** Resolve one active user login without invoking the legacy compatibility scan. */
export async function findUserByExactLogin(
  login: string,
  opts?: { signal?: AbortSignal }
): Promise<User | null> {
  const needle = String(login ?? '').trim();
  if (!needle) return null;

  const result = await haveApiCall<User[]>({
    method: 'GET',
    path: '/users',
    namespace: 'user',
    params: { login: needle, limit: 2, object_state: 'active' },
    signal: opts?.signal,
  });
  const normalized = needle.toLowerCase();
  const exact = expectArray<User>(result.data, 'users')
    .filter((user) => user.login.trim().toLowerCase() === normalized);

  return exact.length === 1 ? exact[0] ?? null : null;
}
