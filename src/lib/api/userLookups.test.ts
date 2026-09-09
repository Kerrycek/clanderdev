import { afterEach, describe, expect, it, vi } from 'vitest';

import { findUserByExactLogin } from './userLookups';

afterEach(() => {
  vi.restoreAllMocks();
  window.vpsAdmin = undefined;
});

describe('findUserByExactLogin', () => {
  it('uses one bounded exact upstream request', async () => {
    window.vpsAdmin = {
      api: { url: 'https://api.example.test', version: 'v7.0' },
      sessionToken: 'tok_123',
      description: {
        meta: { namespace: '_meta' },
        authentication: { token: { http_header: 'X-Auth-Token' } },
      },
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        status: true,
        response: { users: [{ id: 48, login: 'base48', level: 1 }] },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    );

    await expect(findUserByExactLogin(' Base48 ')).resolves.toMatchObject({
      id: 48,
      login: 'base48',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    const parsed = new URL(url);
    expect(parsed.searchParams.get('user[login]')).toBe('Base48');
    expect(parsed.searchParams.get('user[limit]')).toBe('2');
    expect(parsed.searchParams.get('user[object_state]')).toBe('active');
    expect(parsed.searchParams.get('user[q]')).toBeNull();
  });
});
