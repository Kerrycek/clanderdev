import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  FinancePeriodFilterUnsupportedError,
  fetchFinancePaymentHistoryPage,
  fetchFinanceUsersSnapshot,
} from './finance';

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

describe('fetchFinancePaymentHistoryPage', () => {
  it('uses server-side period filters and overfetches one row for an exact next cursor', async () => {
    installApiFixture();

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeOkResponse('user_payments', [
        { id: 8, created_at: '2026-08-21T10:00:00Z' },
        { id: 7, created_at: '2026-08-20T10:00:00Z' },
        { id: 6, created_at: '2026-08-04T10:00:00Z' },
      ]),
    );

    const result = await fetchFinancePaymentHistoryPage({
      limit: 2,
      fromId: 9,
      userId: 42,
      accountedById: 7,
      createdFrom: '2026-08-01',
      createdTo: '2026-08-31',
    });

    expect(result).toEqual({
      rows: [
        { id: 8, created_at: '2026-08-21T10:00:00Z' },
        { id: 7, created_at: '2026-08-20T10:00:00Z' },
      ],
      nextFromId: 7,
      complete: false,
      scannedRows: 3,
      batches: 1,
      invalidCreatedAtRows: 0,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.searchParams.get('user_payment[limit]')).toBe('3');
    expect(url.searchParams.get('user_payment[from_id]')).toBe('9');
    expect(url.searchParams.get('user_payment[user]')).toBe('42');
    expect(url.searchParams.get('user_payment[accounted_by]')).toBe('7');
    expect(url.searchParams.get('user_payment[created_from]')).toBe('2026-08-01T00:00:00.000Z');
    expect(url.searchParams.get('user_payment[created_to]')).toBe('2026-08-31T23:59:59.999Z');
  });

  it('reports the source as complete only after observing its final short page', async () => {
    installApiFixture();

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input));
      const fromId = url.searchParams.get('user_payment[from_id]');
      if (!fromId) {
        return makeOkResponse('user_payments', [
          { id: 10, created_at: '2026-08-31T23:59:59Z' },
          { id: 9, created_at: '2026-08-01T00:00:00Z' },
        ]);
      }
      if (fromId === '9') {
        return makeOkResponse('user_payments', [
          { id: 8, created_at: '2026-07-31T23:59:59Z' },
        ]);
      }
      return makeOkResponse('user_payments', []);
    });

    const result = await fetchFinancePaymentHistoryPage({
      limit: 5,
      createdFrom: '2026-08-01T00:00:00Z',
      createdTo: '2026-08-31T23:59:59Z',
    });

    expect(result.rows.map((row) => row.id)).toEqual([10, 9]);
    expect(result).toMatchObject({
      complete: true,
      scannedRows: 2,
      batches: 1,
      invalidCreatedAtRows: 0,
    });
    expect(result.nextFromId).toBeUndefined();
    expect(result.incompleteReason).toBeUndefined();
  });

  it('does not expose a trailing empty page for an exact page-size result set', async () => {
    installApiFixture();

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input));
      const fromId = url.searchParams.get('user_payment[from_id]');
      if (!fromId) {
        return makeOkResponse('user_payments', [
          { id: 10, created_at: '2026-08-02T00:00:00Z' },
          { id: 9, created_at: '2026-08-01T00:00:00Z' },
        ]);
      }
      return makeOkResponse('user_payments', []);
    });

    const result = await fetchFinancePaymentHistoryPage({ limit: 2 });

    expect(result.rows.map((row) => row.id)).toEqual([10, 9]);
    expect(result).toMatchObject({ complete: true, scannedRows: 2, batches: 1 });
    expect(result.nextFromId).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails closed when an older API silently ignores the period parameters', async () => {
    installApiFixture();

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeOkResponse('user_payments', [
        { id: 10, created_at: '2026-08-20T00:00:00Z' },
        { id: 9, created_at: '2026-08-10T00:00:00Z' },
        { id: 8, created_at: '2026-07-31T23:59:59Z' },
        { id: 7, created_at: '2026-07-30T00:00:00Z' },
      ]),
    );

    await expect(fetchFinancePaymentHistoryPage({
      limit: 50,
      createdFrom: '2026-08-01',
      createdTo: '2026-08-31',
    })).rejects.toBeInstanceOf(FinancePeriodFilterUnsupportedError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails closed when an overfetch response has no safe continuation cursor', async () => {
    installApiFixture();

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeOkResponse('user_payments', [
        { id: 10, created_at: '2026-08-06T00:00:00Z' },
        { id: 9, created_at: '2026-08-05T00:00:00Z' },
        { id: Number.NaN, created_at: '2026-08-04T00:00:00Z' },
        { id: 7, created_at: '2026-08-03T00:00:00Z' },
      ]),
    );

    const result = await fetchFinancePaymentHistoryPage({
      limit: 3,
    });

    expect(result).toMatchObject({
      complete: false,
      scannedRows: 4,
      batches: 1,
      incompleteReason: 'cursor_stalled',
    });
    expect(result.nextFromId).toBeUndefined();
  });

  it('counts malformed row timestamps and rejects malformed filter bounds', async () => {
    installApiFixture();

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeOkResponse('user_payments', [{ id: 10, created_at: 'not-a-date' }]),
    );

    const result = await fetchFinancePaymentHistoryPage({
      createdFrom: '2026-08-01T00:00:00Z',
    });
    expect(result).toMatchObject({
      rows: [],
      complete: true,
      scannedRows: 1,
      invalidCreatedAtRows: 1,
    });

    await expect(fetchFinancePaymentHistoryPage({ createdFrom: 'not-a-date' })).rejects.toThrow(
      'invalid createdFrom',
    );
    await expect(fetchFinancePaymentHistoryPage({ createdTo: '2026-02-30' })).rejects.toThrow(
      'invalid createdTo',
    );
    await expect(
      fetchFinancePaymentHistoryPage({
        createdFrom: '2026-09-01T00:00:00Z',
        createdTo: '2026-08-01T00:00:00Z',
      }),
    ).rejects.toThrow('createdFrom must not be after createdTo');
  });
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
});
