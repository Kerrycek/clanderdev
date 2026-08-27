import { describe, expect, test, vi } from 'vitest';

import type { ChangeRequest, RegistrationRequest } from '../../../lib/api/requests';
import {
  EMPTY_MY_REQUESTS_CURSOR,
  fetchMyRequestsPage,
  type MyRequestsPageFetchers,
} from './MyRequestsModel';

function owned(id: number) {
  return { id, login: 'alice' };
}

function fetchers(
  registrations: (fromId?: number) => RegistrationRequest[],
  changes: (fromId?: number) => ChangeRequest[],
): MyRequestsPageFetchers {
  return {
    registrations: vi.fn(async (_userId, options) => ({
      data: registrations(options.fromId),
    })),
    changes: vi.fn(async (_userId, options) => ({
      data: changes(options.fromId),
    })),
  };
}

describe('MyRequestsModel', () => {
  test('merges one bounded request per source and advances independent cursors', async () => {
    const api = fetchers(
      (fromId) => (fromId
        ? [
            { id: fromId, user: owned(10), created_at: '2026-08-20T10:00:00Z' },
            { id: 99, user: owned(10), created_at: '2026-08-20T10:00:00Z' },
            { id: 98, user: owned(10), created_at: '2026-08-18T10:00:00Z' },
          ]
        : [
            { id: 100, user: owned(10), created_at: '2026-08-22T10:00:00Z' },
            { id: 99, user: owned(10), created_at: '2026-08-20T10:00:00Z' },
          ]),
      (fromId) => (fromId
        ? [{ id: fromId, user: owned(10), created_at: '2026-08-21T10:00:00Z' }]
        : [
            { id: 4, user: owned(10), created_at: '2026-08-23T10:00:00Z' },
            { id: 3, user: owned(10), created_at: '2026-08-21T10:00:00Z' },
          ]),
    );

    const first = await fetchMyRequestsPage({
      userId: 10,
      isAdminAccount: false,
      type: 'all',
      limit: 2,
      cursor: EMPTY_MY_REQUESTS_CURSOR,
    }, api);

    expect(first.rows.map((row) => `${row._type}:${row.id}`)).toEqual([
      'change:4',
      'registration:100',
    ]);
    expect(first.nextCursor).toEqual({ registration: 100, change: 4 });
    expect(api.registrations).toHaveBeenCalledTimes(1);
    expect(api.changes).toHaveBeenCalledTimes(1);

    const second = await fetchMyRequestsPage({
      userId: 10,
      isAdminAccount: false,
      type: 'all',
      limit: 2,
      cursor: first.nextCursor ?? EMPTY_MY_REQUESTS_CURSOR,
      consumedBefore: 2,
    }, api);

    // Inclusive cursor rows from a defensive fixture are removed, while the
    // unconsumed registration is still available on the following page.
    expect(second.rows.map((row) => `${row._type}:${row.id}`)).toEqual([
      'registration:99',
      'registration:98',
    ]);
    expect(new Set([
      ...first.rows.map((row) => `${row._type}:${row.id}`),
      ...second.rows.map((row) => `${row._type}:${row.id}`),
    ]).size).toBe(4);
    expect(api.registrations).toHaveBeenCalledTimes(2);
    expect(api.changes).toHaveBeenCalledTimes(2);
  });

  test('single-type pages call only the selected endpoint and use count metadata', async () => {
    const api: MyRequestsPageFetchers = {
      registrations: vi.fn(async () => ({
        data: [{ id: 7, user: owned(10), created_at: '2026-08-22T10:00:00Z' }],
        meta: { total_count: 1 },
      })),
      changes: vi.fn(async () => ({ data: [] })),
    };

    const page = await fetchMyRequestsPage({
      userId: 10,
      isAdminAccount: false,
      type: 'registration',
      limit: 25,
    }, api);

    expect(page.rows.map((row) => row.id)).toEqual([7]);
    expect(page.canNext).toBe(false);
    expect(page.totalCount).toBe(1);
    expect(api.registrations).toHaveBeenCalledTimes(1);
    expect(api.changes).not.toHaveBeenCalled();
    expect(api.registrations).toHaveBeenCalledWith(10, expect.objectContaining({
      limit: 25,
      count: true,
      explicitOwnerFilter: false,
    }));
  });

  test('privileged self views explicitly owner-filter both request streams', async () => {
    const api = fetchers(() => [], () => []);

    await fetchMyRequestsPage({
      userId: 10,
      isAdminAccount: true,
      type: 'all',
      limit: 25,
    }, api);

    expect(api.registrations).toHaveBeenCalledWith(10, expect.objectContaining({
      explicitOwnerFilter: true,
    }));
    expect(api.changes).toHaveBeenCalledWith(10, expect.objectContaining({
      explicitOwnerFilter: true,
    }));
  });

  test('invalid IDs fail instead of producing a stalled or leaking page', async () => {
    const api = fetchers(
      () => [{ id: 0, user: owned(10) }],
      () => [],
    );

    await expect(fetchMyRequestsPage({
      userId: 10,
      isAdminAccount: false,
      type: 'registration',
      limit: 25,
    }, api)).rejects.toThrow('Request page contains an invalid ID.');
  });
});
