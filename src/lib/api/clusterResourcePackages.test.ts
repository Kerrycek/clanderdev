import { describe, expect, test, vi } from 'vitest';

import { fetchClusterResourcePackages } from './clusterResourcePackages';

function mockFetchOk(response: any) {
  return vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: true, response }) });
}

describe('cluster resource packages API wrappers', () => {
  test('fetchClusterResourcePackages forwards q, is_personal, environment, and user filters', async () => {
    globalThis.fetch = mockFetchOk({
      cluster_resource_packages: [{ id: 77, label: 'Personal package', is_personal: true }],
      _meta: { total_count: 1 },
    }) as any;

    const res = await fetchClusterResourcePackages({
      q: 'alice',
      isPersonal: true,
      environmentId: 5,
      userId: 9,
      limit: 20,
      fromId: 40,
    });

    expect(res.data).toEqual([{ id: 77, label: 'Personal package', is_personal: true }]);

    const [url] = vi.mocked(globalThis.fetch).mock.calls.find(([input]) =>
      new URL(input instanceof Request ? input.url : input).pathname.endsWith('/cluster_resource_packages'),
    )!;
    const u = new URL(url instanceof Request ? url.url : url);

    expect(u.pathname).toBe('/v7.0/cluster_resource_packages');
    expect(u.searchParams.get('cluster_resource_package[q]')).toBe('alice');
    expect(u.searchParams.get('cluster_resource_package[is_personal]')).toBe('true');
    expect(u.searchParams.get('cluster_resource_package[environment]')).toBe('5');
    expect(u.searchParams.get('cluster_resource_package[user]')).toBe('9');
    expect(u.searchParams.get('cluster_resource_package[limit]')).toBe('20');
    expect(u.searchParams.get('cluster_resource_package[from_id]')).toBe('40');
    expect(u.searchParams.get('_meta[includes]')).toBe('environment,user');
  });

  test('fetchClusterResourcePackages serializes a null user filter for shared packages', async () => {
    globalThis.fetch = mockFetchOk({
      cluster_resource_packages: [{ id: 11, label: 'Standard Production' }],
      _meta: { total_count: 1 },
    }) as any;

    await fetchClusterResourcePackages({ userId: null, limit: 500 });

    const [url] = vi.mocked(globalThis.fetch).mock.calls.find(([input]) =>
      new URL(input instanceof Request ? input.url : input).pathname.endsWith('/cluster_resource_packages'),
    )!;
    const u = new URL(url instanceof Request ? url.url : url);

    expect(u.searchParams.has('cluster_resource_package[user]')).toBe(true);
    expect(u.searchParams.get('cluster_resource_package[user]')).toBe('');
  });
});
