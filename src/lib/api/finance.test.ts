import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchFinanceUsersSnapshot } from './finance';

function makeOkResponse(resource: string, rows: unknown[]) {
  return new Response(JSON.stringify({ status: true, response: { [resource]: rows } }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function installApiFixture() {
  window.vpsAdmin = {
    api: { url: 'https://api.example.test', version: 'v7.0' },
    sessionToken: 'tok_123',
    description: {
      meta: { namespace: '_meta' },
      authentication: { token: { http_header: 'X-Auth-Token' } },
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  window.vpsAdmin = undefined;
});

describe('fetchFinanceUsersSnapshot', () => {
  it('collects every keyset page and marks a trustworthy KPI snapshot complete', async () => {
    installApiFixture();

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input));
      const fromId = url.searchParams.get('user[from_id]');
      const objectState = url.searchParams.get('user[object_state]');
      if (objectState === 'suspended') {
        return makeOkResponse('users', [{ id: 4, login: 'four', level: 1, object_state: 'suspended' }]);
      }
      if (!fromId) {
        return makeOkResponse('users', [
          { id: 1, login: 'one', level: 1, object_state: 'active' },
          { id: 2, login: 'two', level: 1, object_state: 'active' },
        ]);
      }
      if (fromId === '2') {
        return makeOkResponse('users', [{ id: 3, login: 'three', level: 1, object_state: 'active' }]);
      }
      return makeOkResponse('users', []);
    });

    const result = await fetchFinanceUsersSnapshot({ batchSize: 2 });

    expect(result.rows.map((user) => user.id)).toEqual([1, 2, 3, 4]);
    expect(result).toMatchObject({ complete: true, scannedRows: 4, batches: 3 });
    expect(result.nextFromId).toBeUndefined();
    expect(result.incompleteReason).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.map(([input]) => new URL(String(input)).searchParams.get('user[object_state]')))
      .toEqual(['active', 'active', 'suspended']);
  });

  it('never presents a scan-limited user snapshot as a complete global set', async () => {
    installApiFixture();

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input));
      const fromId = Number(url.searchParams.get('user[from_id]') ?? 0);
      const limit = Number(url.searchParams.get('user[limit]'));
      return makeOkResponse(
        'users',
        Array.from({ length: limit }, (_, index) => ({
          id: fromId + index + 1,
          login: `user-${fromId + index + 1}`,
          level: 1,
        })),
      );
    });

    const result = await fetchFinanceUsersSnapshot({ batchSize: 2, scanLimit: 3 });

    expect(result.rows.map((user) => user.id)).toEqual([1, 2, 3]);
    expect(result).toMatchObject({
      nextFromId: 3,
      complete: false,
      scannedRows: 3,
      batches: 2,
      incompleteReason: 'scan_limit',
    });
  });

  it('fails closed when a full page does not advance the ascending user cursor', async () => {
    installApiFixture();

    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => (
      makeOkResponse('users', [
        { id: 1, login: 'one', level: 1, object_state: 'active' },
        { id: 2, login: 'two', level: 1, object_state: 'active' },
      ])
    ));

    const result = await fetchFinanceUsersSnapshot({ batchSize: 2 });

    expect(result).toMatchObject({
      complete: false,
      scannedRows: 4,
      batches: 2,
      incompleteReason: 'cursor_stalled',
    });
    expect(result.nextFromId).toBeUndefined();
  });
});
