import { describe, expect, test, vi } from 'vitest';

import { fetchNodePools, fetchNodes } from './nodes';

function mockFetchOk(response: any) {
  return vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: true, response }) });
}

function lastFetchCall() {
  const calls = (globalThis.fetch as any).mock.calls;
  return calls[calls.length - 1] as [string, RequestInit?];
}

describe('nodes API wrappers', () => {
  test('fetchNodes forwards q, state, limit, from_id, and node filters', async () => {
    globalThis.fetch = mockFetchOk({ nodes: [{ id: 12, name: 'node12' }], _meta: { total_count: 1 } }) as any;

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
    const u = new URL(url);

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

    const res = await fetchNodePools(12, { limit: 100 });

    expect(res.data).toEqual([{ id: 7, name: 'tank' }]);

    const [url] = lastFetchCall();
    const u = new URL(url);

    expect(u.pathname).toBe('/v7.0/pools');
    expect(u.searchParams.get('pool[node]')).toBe('12');
    expect(u.searchParams.get('pool[limit]')).toBe('100');
  });
});
