import { describe, expect, test, vi } from 'vitest';

import { HaveApiError } from './haveapi';
import {
  NodeCreateReconciliationIncompleteError,
  reconcileNodeCreate,
  reconcileNodeCreateAfterSettling,
} from './nodeCreateReconciliation';
import {
  createNode,
  fetchPool,
  fetchNodePools,
  fetchNodes,
  NodeCreateIndeterminateError,
  setPoolMaintenance,
} from './nodes';

function mockFetchOk(response: any) {
  return vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: true, response }) });
}

function lastFetchCall() {
  const calls = vi.mocked(globalThis.fetch).mock.calls;
  const call = calls[calls.length - 1];
  if (!call) throw new Error('Expected fetch to have been called');
  return call;
}

describe('nodes API wrappers', () => {
  test('fetchNodes forwards q, state, limit, from_id, and node filters', async () => {
    vi.stubGlobal('fetch', mockFetchOk({ nodes: [{ id: 12, name: 'node12' }], _meta: { total_count: 1 } }));

    const res = await fetchNodes({
      q: 'node12',
      state: 'inactive',
      limit: 25,
      fromId: 400,
      location: 7,
      type: 'node',
      hypervisorType: 'vpsadminos',
    });

    expect(res.data).toEqual([{ id: 12, name: 'node12' }]);

    const [url] = lastFetchCall();
    const u = new URL(String(url));

    expect(u.pathname).toBe('/v7.0/nodes');
    expect(u.searchParams.get('node[q]')).toBe('node12');
    expect(u.searchParams.get('node[state]')).toBe('inactive');
    expect(u.searchParams.get('node[limit]')).toBe('25');
    expect(u.searchParams.get('node[from_id]')).toBe('400');
    expect(u.searchParams.get('node[location]')).toBe('7');
    expect(u.searchParams.get('node[type]')).toBe('node');
    expect(u.searchParams.get('node[hypervisor_type]')).toBe('vpsadminos');
  });

  test('fetchNodePools limits pools to the selected node', async () => {
    globalThis.fetch = mockFetchOk({ pools: [{ id: 7, name: 'tank' }] }) as typeof fetch;
    const controller = new AbortController();

    const res = await fetchNodePools(12, { limit: 100, signal: controller.signal });

    expect(res.data).toEqual([{ id: 7, name: 'tank' }]);

    const [url, init] = lastFetchCall();
    const u = new URL(String(url));

    expect(u.pathname).toBe('/v7.0/pools');
    expect(u.searchParams.get('pool[node]')).toBe('12');
    expect(u.searchParams.get('pool[limit]')).toBe('100');
    expect(init?.signal).toBe(controller.signal);
  });

  test('fetchPool reads back the exact selected pool', async () => {
    globalThis.fetch = mockFetchOk({
      pool: { id: 11, node: { id: 5 }, maintenance_lock: 'lock', maintenance_lock_reason: 'Disk replacement' },
    }) as typeof fetch;

    const res = await fetchPool(11);

    expect(res.data).toMatchObject({ id: 11, maintenance_lock: 'lock' });
    const [url, init] = lastFetchCall();
    expect(new URL(String(url)).pathname).toBe('/v7.0/pools/11');
    expect(init?.method).toBe('GET');
  });

  test('fetchPool rejects a mismatched read-back identity', async () => {
    globalThis.fetch = mockFetchOk({ pool: { id: 12, node: 5, maintenance_lock: 'no' } }) as typeof fetch;

    await expect(fetchPool(11)).rejects.toThrow('response id does not match requested pool');
  });

  test('setPoolMaintenance locks the selected pool with a reason', async () => {
    vi.stubGlobal('fetch', mockFetchOk({}));

    await setPoolMaintenance(11, { lock: true, reason: 'Disk replacement' });

    const [url, init] = lastFetchCall();
    expect(new URL(String(url)).pathname).toBe('/v7.0/pools/11/set_maintenance');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      pool: { lock: true, reason: 'Disk replacement' },
    });
  });

  test('setPoolMaintenance unlocks without sending a reason', async () => {
    vi.stubGlobal('fetch', mockFetchOk({}));

    await setPoolMaintenance(12, { lock: false });

    const [url, init] = lastFetchCall();
    expect(new URL(String(url)).pathname).toBe('/v7.0/pools/12/set_maintenance');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ pool: { lock: false } });
  });

  test('marks an HTTP 5xx node create result indeterminate', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ status: false, message: 'upstream unavailable', response: null }),
    }));

    await expect(createNode({
      name: 'node42',
      type: 'node',
      location: 7,
      ip_addr: '192.0.2.42',
    })).rejects.toBeInstanceOf(NodeCreateIndeterminateError);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  test('marks a lost node create response indeterminate without retrying', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('connection reset')));

    await expect(createNode({
      name: 'node42',
      type: 'node',
      location: 7,
      ip_addr: '192.0.2.42',
    })).rejects.toBeInstanceOf(NodeCreateIndeterminateError);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  test('keeps a definitive 4xx node create rejection retryable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ status: false, message: 'invalid node', response: null }),
    }));

    const promise = createNode({
      name: 'node42',
      type: 'node',
      location: 7,
      ip_addr: '192.0.2.42',
    });
    await expect(promise).rejects.toBeInstanceOf(HaveApiError);
    await expect(promise).rejects.not.toBeInstanceOf(NodeCreateIndeterminateError);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  test('reconciles an indeterminate create by scanning beyond the visible page', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (input: string) => {
      const url = new URL(input);
      const fromId = url.searchParams.get('node[from_id]');
      const nodes = fromId
        ? [{ id: 42, name: 'node42', ip_addr: '192.0.2.42' }]
        : [
            { id: 9, name: 'node9', ip_addr: '192.0.2.9' },
            { id: 10, name: 'node10', ip_addr: '192.0.2.10' },
          ];
      return { ok: true, json: async () => ({ status: true, response: { nodes } }) };
    }));

    await expect(reconcileNodeCreate(
      { name: 'node42', ip_addr: '192.0.2.42' },
      { pageSize: 2, maxNodes: 10 },
    )).resolves.toEqual({ status: 'found', node: { id: 42, name: 'node42', ip_addr: '192.0.2.42' } });

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    const calls = vi.mocked(globalThis.fetch).mock.calls;
    const firstUrl = new URL(String(calls[0]?.[0]));
    const secondUrl = new URL(String(calls[1]?.[0]));
    expect(firstUrl.searchParams.get('node[state]')).toBe('all');
    expect(firstUrl.searchParams.has('node[q]')).toBe(false);
    expect(secondUrl.searchParams.get('node[from_id]')).toBe('10');
  });

  test('keeps create reconciliation blocked when a bounded scan is incomplete', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: true,
        response: {
          nodes: [
            { id: 10, name: 'node10', ip_addr: '192.0.2.10' },
            { id: 9, name: 'node9', ip_addr: '192.0.2.9' },
          ],
        },
      }),
    }));

    await expect(reconcileNodeCreate(
      { name: 'node42', ip_addr: '192.0.2.42' },
      { pageSize: 2, maxNodes: 2 },
    )).rejects.toBeInstanceOf(NodeCreateReconciliationIncompleteError);
  });

  test('catches a late node commit during the settling window', async () => {
    let scan = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
      scan += 1;
      const nodes = scan === 1
        ? [{ id: 10, name: 'node10', ip_addr: '192.0.2.10' }]
        : [{ id: 42, name: 'node42', ip_addr: '192.0.2.42' }];
      return { ok: true, json: async () => ({ status: true, response: { nodes } }) };
    }));
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(reconcileNodeCreateAfterSettling(
      { name: 'node42', ip_addr: '192.0.2.42' },
      { pageSize: 2, maxNodes: 10, attempts: 4, settleDelayMs: 0, sleep },
    )).resolves.toEqual({ status: 'found', node: { id: 42, name: 'node42', ip_addr: '192.0.2.42' } });

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  test('keeps repeated complete scans unresolved instead of declaring a safe retry', async () => {
    vi.stubGlobal('fetch', mockFetchOk({
      nodes: [{ id: 10, name: 'node10', ip_addr: '192.0.2.10' }],
    }));
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(reconcileNodeCreateAfterSettling(
      { name: 'node42', ip_addr: '192.0.2.42' },
      { pageSize: 2, maxNodes: 10, attempts: 4, settleDelayMs: 0, sleep },
    )).resolves.toEqual({ status: 'unresolved' });

    expect(globalThis.fetch).toHaveBeenCalledTimes(4);
    expect(sleep).toHaveBeenCalledTimes(3);
  });
});
