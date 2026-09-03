import { afterEach, describe, expect, it, vi } from 'vitest';

import { createUser, deleteUser, fetchUsers, searchUsers, updateUser } from './users';

function makeOkResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeUsersResponse(rows: unknown[]) {
  return makeOkResponse({ status: true, response: { users: rows } });
}

afterEach(() => {
  vi.restoreAllMocks();
  window.vpsAdmin = undefined;
});

describe('fetchUsers', () => {
  function installApiFixture() {
    (window as any).vpsAdmin = {
      api: { url: 'https://api.example.test', version: 'v7.0' },
      sessionToken: 'tok_123',
      description: {
        meta: { namespace: '_meta' },
        authentication: {
          token: { http_header: 'X-Auth-Token' },
        },
      },
    };
  }

  it('uses only supported upstream params when no compatibility scan is needed', async () => {
    installApiFixture();

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeUsersResponse([{ id: 125, login: 'admin', level: 90, mailer_enabled: false }])
    );

    const res = await fetchUsers({
      limit: 25,
      fromId: 150,
      count: true,
      role: 'admin',
      level: 90,
      mailerEnabled: false,
    });

    expect(res.data).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const parsed = new URL(url);

    expect(parsed.searchParams.get('user[limit]')).toBe('25');
    expect(parsed.searchParams.get('user[from_id]')).toBe('150');
    expect(parsed.searchParams.get('user[level]')).toBe('90');
    expect(parsed.searchParams.get('user[mailer_enabled]')).toBe('false');
    expect(parsed.searchParams.get('user[admin]')).toBe('true');
    expect(parsed.searchParams.get('_meta[count]')).toBe('true');

    expect(parsed.searchParams.get('user[q]')).toBeNull();
    expect(parsed.searchParams.get('user[role]')).toBeNull();
    expect(init.headers).toMatchObject({ 'X-Auth-Token': 'tok_123' });
  });

  it('scans keyset pages and filters client-side for legacy q/role filters', async () => {
    installApiFixture();

    const firstBatch = Array.from({ length: 100 }, (_, idx) => ({
      id: idx + 1,
      login: `plain-${idx + 1}`,
      level: idx % 3 === 0 ? 21 : 10,
    }));

    const secondBatch = [
      { id: 101, login: 'alpha', level: 21 },
      { id: 102, login: 'bobby', level: 21 },
      { id: 103, login: 'bobette', level: 10 },
      { id: 104, login: 'delta', level: 21 },
      { id: 105, login: 'bob-support', level: 21 },
    ];

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const parsed = new URL(String(input));
      const fromId = parsed.searchParams.get('user[from_id]');

      if (!fromId) {
        return makeUsersResponse(firstBatch);
      }

      if (fromId === '100') {
        return makeUsersResponse(secondBatch);
      }

      return makeUsersResponse([]);
    });

    const res = await fetchUsers({
      limit: 2,
      q: 'bob',
      role: 'support',
    });

    expect(res.data.map((u) => u.id)).toEqual([102, 105]);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const firstUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    const secondUrl = new URL(String(fetchMock.mock.calls[1]?.[0]));

    // Compatibility scan intentionally avoids stale upstream params like q/role.
    expect(firstUrl.searchParams.get('user[q]')).toBeNull();
    expect(firstUrl.searchParams.get('user[role]')).toBeNull();
    expect(firstUrl.searchParams.get('user[limit]')).toBe('100');

    expect(secondUrl.searchParams.get('user[from_id]')).toBe('100');
    expect(secondUrl.searchParams.get('user[q]')).toBeNull();
    expect(secondUrl.searchParams.get('user[role]')).toBeNull();
  });

  it('applies boolean compatibility filters client-side', async () => {
    installApiFixture();

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeUsersResponse([
        { id: 120, login: 'plain', level: 21, lockout: false },
        { id: 119, login: 'locked', level: 21, lockout: true },
        { id: 118, login: 'reset', level: 21, password_reset: true },
      ])
    );

    const res = await fetchUsers({ limit: 5, lockout: true });

    expect(res.data.map((u) => u.id)).toEqual([119]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.searchParams.get('user[lockout]')).toBeNull();
  });

  it('does not expose an unfiltered HaveAPI count for compatibility filters', async () => {
    installApiFixture();

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeOkResponse({
        status: true,
        response: {
          users: [{ id: 10, login: 'matching-user', level: 1 }],
          _meta: { total_count: 20_000 },
        },
      })
    );

    const res = await fetchUsers({ limit: 25, q: 'matching', count: true });

    expect(res.data).toHaveLength(1);
    expect(res.meta).toBeUndefined();
  });

  it('returns a continuation cursor instead of a false empty end after the bounded compatibility scan', async () => {
    installApiFixture();

    const allRows = [
      ...Array.from({ length: 1_200 }, (_, index) => ({
        id: index + 1,
        login: `plain-${index + 1}`,
        level: 1,
      })),
      { id: 1_201, login: 'needle-user', level: 1 },
    ];
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input));
      const fromId = Number(url.searchParams.get('user[from_id]') ?? 0);
      const limit = Number(url.searchParams.get('user[limit]') ?? 100);
      return makeUsersResponse(allRows.filter((row) => row.id > fromId).slice(0, limit));
    });

    const first = await fetchUsers({ limit: 25, q: 'needle' });
    expect(first.data).toEqual([]);
    expect(first.compat).toMatchObject({ complete: false, nextFromId: 1_200, scannedRows: 1_200 });
    expect(fetchMock).toHaveBeenCalledTimes(12);

    const second = await fetchUsers({ limit: 25, q: 'needle', fromId: first.compat?.nextFromId });
    expect(second.data.map((user) => user.id)).toEqual([1_201]);
    expect(second.compat).toMatchObject({ complete: true });
  });
});

describe('updateUser', () => {
  function installApiFixture() {
    (window as any).vpsAdmin = {
      api: { url: 'https://api.example.test', version: 'v7.0' },
      sessionToken: 'tok_123',
      description: {
        meta: { namespace: '_meta' },
        authentication: {
          token: { http_header: 'X-Auth-Token' },
        },
      },
    };
  }

  it('sends generated password controls through the user namespace', async () => {
    installApiFixture();

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeOkResponse({
        status: true,
        response: {
          user: { id: 1, login: 'kerry', level: 99 },
        },
      })
    );

    await updateUser(1, {
      new_password: 'Abc123abc123abc123ab',
      logout_sessions: true,
      password_reset: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const parsed = new URL(url);

    expect(parsed.pathname).toBe('/v7.0/users/1');
    expect(parsed.searchParams.get('user[new_password]')).toBeNull();
    expect(JSON.parse(String(init.body))).toEqual({
      user: {
        new_password: 'Abc123abc123abc123ab',
        logout_sessions: true,
        password_reset: true,
      },
    });
    expect(init.method).toBe('PUT');
    expect(init.headers).toMatchObject({ 'X-Auth-Token': 'tok_123' });
  });

  it('accepts a synchronous lifetime-date update without an action-state id', async () => {
    installApiFixture();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeOkResponse({ status: true, response: { user: { id: 1, login: 'kerry', level: 99 } } })
    );

    await expect(updateUser(1, { expiration_date: null })).resolves.toMatchObject({
      data: { id: 1, login: 'kerry' },
    });
  });

  it('fails closed when a user object-state update has no action-state id', async () => {
    installApiFixture();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeOkResponse({ status: true, response: { user: { id: 1, login: 'kerry', level: 99 } } })
    );

    await expect(updateUser(1, { object_state: 'suspended' })).rejects.toMatchObject({
      code: 'MISSING_ACTION_STATE',
    });
  });
});

describe('searchUsers', () => {
  function installApiFixture() {
    (window as any).vpsAdmin = {
      api: { url: 'https://api.example.test', version: 'v7.0' },
      sessionToken: 'tok_123',
      description: {
        meta: { namespace: '_meta' },
        authentication: {
          token: { http_header: 'X-Auth-Token' },
        },
      },
    };
  }

  it('falls back to cluster search when direct login lookup returns no users', async () => {
    installApiFixture();

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input));

      if (url.pathname === '/v7.0/users') {
        return makeUsersResponse([]);
      }

      if (url.pathname === '/v7.0/cluster/search') {
        return makeOkResponse({
          status: true,
          response: {
            cluster: [
              { resource: 'User', id: 4616, value: 'stevob', attribute: 'login' },
              { resource: 'Vps', id: 12, value: 'stevob' },
            ],
          },
        });
      }

      if (url.pathname === '/v7.0/users/4616') {
        return makeOkResponse({
          status: true,
          response: {
            user: {
              id: 4616,
              login: 'stevob',
              full_name: 'Štefan Bystriansky',
              email: 'bystriansky.stefan12@gmail.com',
              level: 1,
            },
          },
        });
      }

      throw new Error(`unexpected fetch ${url.pathname}`);
    });

    const res = await searchUsers({ q: 'stevob', limit: 8 });

    expect(res.data).toEqual([
      expect.objectContaining({
        id: 4616,
        login: 'stevob',
        full_name: 'Štefan Bystriansky',
      }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('merges login, full-name, email and cluster results without duplicates', async () => {
    installApiFixture();

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input));

      if (url.pathname === '/v7.0/users') {
        if (url.searchParams.has('user[login]')) {
          return makeUsersResponse([{ id: 10, login: 'stevob', full_name: 'Stefan', level: 1 }]);
        }
        if (url.searchParams.has('user[full_name]')) {
          return makeUsersResponse([{ id: 11, login: 'stefanb', full_name: 'Stevob Example', level: 1 }]);
        }
        if (url.searchParams.has('user[email]')) {
          return makeUsersResponse([{ id: 10, login: 'stevob', full_name: 'Stefan', level: 1 }]);
        }
      }

      if (url.pathname === '/v7.0/cluster/search') {
        return makeOkResponse({
          status: true,
          response: {
            cluster: [
              { resource: 'User', id: 10, value: 'stevob', attribute: 'login' },
              { resource: 'User', id: 12, value: 'stevob-note', attribute: 'info' },
            ],
          },
        });
      }

      if (url.pathname === '/v7.0/users/12') {
        return makeOkResponse({
          status: true,
          response: { user: { id: 12, login: 'notehit', full_name: 'Cluster Hit', level: 1 } },
        });
      }

      throw new Error(`unexpected fetch ${url.pathname}`);
    });

    const res = await searchUsers({ q: 'stevob', limit: 8 });

    expect(res.data.map((u) => u.id)).toEqual([10, 11, 12]);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});

describe('admin user mutations', () => {
  function installApiFixture() {
    (window as any).vpsAdmin = {
      api: { url: 'https://api.example.test', version: 'v7.0' },
      sessionToken: 'tok_123',
      description: {
        meta: { namespace: '_meta' },
        authentication: {
          token: { http_header: 'X-Auth-Token' },
        },
      },
    };
  }

  it('creates a user through the user namespace', async () => {
    installApiFixture();

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeOkResponse({
        status: true,
        response: { user: { id: 42, login: 'newbie', level: 2 } },
      })
    );

    await createUser({
      login: 'newbie',
      password: 'Secret123456',
      full_name: 'New User',
      email: 'newbie@example.test',
      address: 'Test street',
      level: 2,
      info: 'created from webui',
      monthly_payment: 300,
      mailer_enabled: true,
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const parsed = new URL(url);

    expect(parsed.pathname).toBe('/v7.0/users');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      user: {
        login: 'newbie',
        password: 'Secret123456',
        full_name: 'New User',
        email: 'newbie@example.test',
        address: 'Test street',
        level: 2,
        info: 'created from webui',
        monthly_payment: 300,
        mailer_enabled: true,
      },
    });
  });

  it('deletes a user with the selected object state', async () => {
    installApiFixture();

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeOkResponse({ status: true, response: {} })
    );

    await deleteUser(42, { object_state: 'deleted' });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const parsed = new URL(url);

    expect(parsed.pathname).toBe('/v7.0/users/42');
    expect(init.method).toBe('DELETE');
    expect(JSON.parse(String(init.body))).toEqual({
      user: {
        object_state: 'deleted',
      },
    });
  });
});
