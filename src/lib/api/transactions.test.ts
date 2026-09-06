import { describe, expect, test, vi } from 'vitest';

import {
  fetchDatasetSnapshotRollbackChains,
  fetchLatestDatasetTransactionChains,
  fetchTransaction,
  fetchTransactionChain,
  fetchTransactionChains,
  fetchTransactions,
} from './transactions';

function mockFetchOk(response: any) {
  return vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: true, response }) });
}

function lastFetchUrl() {
  const calls = (globalThis.fetch as any).mock.calls;
  const [url] = calls[calls.length - 1] as [string, RequestInit?];
  return new URL(url);
}

describe('transactions API wrappers', () => {
  test('fetchTransactionChains forwards HaveAPI index filters', async () => {
    globalThis.fetch = mockFetchOk({ transaction_chain: [{ id: 10, label: 'chain' }], _meta: { total_count: 1 } }) as any;

    const res = await fetchTransactionChains({
      limit: 25,
      fromId: 90,
      state: 'failed',
      name: 'restart',
      className: 'Vps',
      rowId: 123,
      userId: 7,
      userSessionId: 44,
      count: true,
    });

    expect(res.data).toEqual([{ id: 10, label: 'chain' }]);

    const u = lastFetchUrl();
    expect(u.pathname).toBe('/v7.0/transaction_chains');
    expect(u.searchParams.get('transaction_chain[limit]')).toBe('25');
    expect(u.searchParams.get('transaction_chain[from_id]')).toBe('90');
    expect(u.searchParams.get('transaction_chain[state]')).toBe('failed');
    expect(u.searchParams.get('transaction_chain[name]')).toBe('restart');
    expect(u.searchParams.get('transaction_chain[class_name]')).toBe('Vps');
    expect(u.searchParams.get('transaction_chain[row_id]')).toBe('123');
    expect(u.searchParams.get('transaction_chain[user]')).toBe('7');
    expect(u.searchParams.get('transaction_chain[user_session]')).toBe('44');
    expect(u.searchParams.get('_meta[count]')).toBe('true');
  });

  test('reads both dataset snapshot rollback chain names in the Dataset scope', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({
        status: true,
        response: { transaction_chain: [{ id: 81, name: 'rollback', state: 'done' }] },
      }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({
        status: true,
        response: { transaction_chain: [{ id: 82, name: 'restore', state: 'done' }] },
      }) });
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(fetchDatasetSnapshotRollbackChains(123)).resolves.toEqual({
      rollback: [{ id: 81, name: 'rollback', state: 'done' }],
      restore: [{ id: 82, name: 'restore', state: 'done' }],
    });
    const urls = fetchMock.mock.calls.map(([url]) => new URL(String(url)));
    expect(urls.map((url) => url.searchParams.get('transaction_chain[name]')).sort())
      .toEqual(['restore', 'rollback']);
    for (const url of urls) {
      expect(url.searchParams.get('transaction_chain[class_name]')).toBe('Dataset');
      expect(url.searchParams.get('transaction_chain[row_id]')).toBe('123');
      expect(url.searchParams.get('transaction_chain[limit]')).toBe('100');
    }
  });

  test('reads one latest Dataset chain as a global rollback high-water mark', async () => {
    globalThis.fetch = mockFetchOk({ transaction_chain: [{ id: 83, state: 'done' }] }) as typeof fetch;

    await expect(fetchLatestDatasetTransactionChains(123)).resolves.toEqual([{ id: 83, state: 'done' }]);
    const url = lastFetchUrl();
    expect(url.searchParams.get('transaction_chain[limit]')).toBe('1');
    expect(url.searchParams.get('transaction_chain[class_name]')).toBe('Dataset');
    expect(url.searchParams.get('transaction_chain[row_id]')).toBe('123');
    expect(url.searchParams.get('transaction_chain[name]')).toBeNull();
  });

  test('fetchTransactions forwards transaction-chain debug filters', async () => {
    globalThis.fetch = mockFetchOk({ transaction: [{ id: 501, name: 'tx' }] }) as any;

    const res = await fetchTransactions({
      limit: 100,
      fromId: 600,
      transactionChainId: 42,
      nodeId: 3,
      userId: 7,
      type: 12,
      success: 0,
      done: 'done',
      q: 'mount',
    });

    expect(res.data).toEqual([{ id: 501, name: 'tx' }]);

    const u = lastFetchUrl();
    expect(u.pathname).toBe('/v7.0/transactions');
    expect(u.searchParams.get('transaction[limit]')).toBe('100');
    expect(u.searchParams.get('transaction[from_id]')).toBe('600');
    expect(u.searchParams.get('transaction[transaction_chain]')).toBe('42');
    expect(u.searchParams.get('transaction[node]')).toBe('3');
    expect(u.searchParams.get('transaction[user]')).toBe('7');
    expect(u.searchParams.get('transaction[type]')).toBe('12');
    expect(u.searchParams.get('transaction[success]')).toBe('0');
    expect(u.searchParams.get('transaction[done]')).toBe('done');
    expect(u.searchParams.get('transaction[q]')).toBe('mount');
  });

  test('detail helpers use show endpoints without namespaced query params', async () => {
    globalThis.fetch = mockFetchOk({ transaction_chain: { id: 42 } }) as any;
    await fetchTransactionChain(42);
    expect(lastFetchUrl().pathname).toBe('/v7.0/transaction_chains/42');
    expect(lastFetchUrl().search).toBe('');

    globalThis.fetch = mockFetchOk({ transaction: { id: 501 } }) as any;
    await fetchTransaction(501);
    expect(lastFetchUrl().pathname).toBe('/v7.0/transactions/501');
    expect(lastFetchUrl().search).toBe('');
  });
});
