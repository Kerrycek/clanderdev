import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchDnsZones } from '../api/dns';
import { fetchIpAddresses } from '../api/ipAddresses';
import { fetchVps, fetchVpsList } from '../api/vps';
import { buildUserGlobalSearchResults, searchUserObjects } from './userGlobalSearch';

vi.mock('../api/dns', () => ({ fetchDnsZones: vi.fn() }));
vi.mock('../api/ipAddresses', () => ({ fetchIpAddresses: vi.fn() }));
vi.mock('../api/vps', () => ({ fetchVps: vi.fn(), fetchVpsList: vi.fn() }));

function t(key: string, vars?: Record<string, unknown>): string {
  if (key === 'common.vps_ref') return `VPS #${vars?.['id']}`;
  if (key === 'common.resource_ref') return `${vars?.['resource']} #${vars?.['id']}`;
  if (key === 'object_kind.dns_zone') return 'DNS zone';
  if (key === 'palette.result.vps.matched_ip') return `Matched IP ${vars?.['ip']}`;
  if (key === 'palette.result.ip.assigned_vps') return `Assigned to ${vars?.['vps']}`;
  if (key === 'palette.result.ip.owned') return 'Owned IP';
  return key;
}

describe('buildUserGlobalSearchResults', () => {
  it('returns only VPS, owned IP and DNS result groups and finds a VPS through its IP', () => {
    const results = buildUserGlobalSearchResults({
      basePath: '/app',
      query: 'needle',
      t,
      vpses: [{ id: 10, hostname: 'web.example' }],
      ipAddresses: [
        {
          id: 20,
          addr: '203.0.113.20',
          prefix: 32,
          network_interface: { id: 30, vps: { id: 11, hostname: 'mail.example' } },
        },
      ],
      dnsZones: [{ id: 40, name: 'example.test', label: 'Primary zone' }],
    });

    expect(results.map((result) => result.group)).toEqual([
      'vps',
      'vps',
      'ips',
      'dns_zones',
    ]);
    expect(results.map((result) => result.key)).toEqual([
      'vps:10',
      'vps:11',
      'ip:20',
      'dns:40',
    ]);
    expect(results[1]).toMatchObject({
      primary: 'mail.example',
      secondary: 'Matched IP 203.0.113.20/32',
      href: '/app/vps/11',
    });
    expect(results[2]).toMatchObject({
      href: '/app/vps/11/network',
      resource: 'IpAddress',
    });
    expect(results.some((result) => ['Dataset', 'Snapshot', 'Backup'].includes(result.resource))).toBe(false);
  });

  it('honours explicit kinds and bounds each result group', () => {
    const results = buildUserGlobalSearchResults({
      basePath: '/app',
      query: 'example',
      t,
      vpses: [
        { id: 1, hostname: 'one' },
        { id: 2, hostname: 'two' },
      ],
      ipAddresses: [{ id: 3, addr: '192.0.2.3', prefix: 32 }],
      dnsZones: [
        { id: 4, name: 'one.example' },
        { id: 5, name: 'two.example' },
      ],
      kinds: ['dns_zones'],
      limitPerGroup: 1,
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ key: 'dns:4', group: 'dns_zones' });
  });
});

describe('searchUserObjects exact VPS ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchVpsList).mockResolvedValue({ data: [] } as unknown as Awaited<ReturnType<typeof fetchVpsList>>);
    vi.mocked(fetchIpAddresses).mockResolvedValue({ data: [] } as unknown as Awaited<ReturnType<typeof fetchIpAddresses>>);
    vi.mocked(fetchDnsZones).mockResolvedValue({ data: [] } as unknown as Awaited<ReturnType<typeof fetchDnsZones>>);
  });

  it.each([
    ['another owner', { id: 99, hostname: 'foreign', user: { id: 7 } }],
    ['an omitted owner', { id: 99, hostname: 'ambiguous' }],
  ])('does not expose an exact-ID VPS with %s', async (_label, vps) => {
    vi.mocked(fetchVps).mockResolvedValue({ data: vps } as unknown as Awaited<ReturnType<typeof fetchVps>>);
    // Exercise both possible sources: the exact show action and a backend that
    // also returns the numeric query through the list action.
    vi.mocked(fetchVpsList).mockResolvedValue({
      data: [vps],
    } as unknown as Awaited<ReturnType<typeof fetchVpsList>>);

    const results = await searchUserObjects({
      basePath: '/app',
      query: '99',
      expectedUserId: 42,
      kinds: ['vps'],
      t,
    });

    expect(results).toEqual([]);
  });

  it('keeps an exact-ID VPS only when its owner matches', async () => {
    vi.mocked(fetchVps).mockResolvedValue({
      data: { id: 99, hostname: 'mine', user: { id: 42 } },
    } as unknown as Awaited<ReturnType<typeof fetchVps>>);

    const results = await searchUserObjects({
      basePath: '/app',
      query: '#99',
      expectedUserId: 42,
      kinds: ['vps'],
      t,
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ key: 'vps:99', href: '/app/vps/99' });
  });

  it('keeps results from healthy indexes when another search index fails', async () => {
    vi.mocked(fetchVpsList).mockResolvedValue({
      data: [{ id: 3, hostname: 'web.example' }],
    } as unknown as Awaited<ReturnType<typeof fetchVpsList>>);
    vi.mocked(fetchDnsZones).mockRejectedValue(new Error('DNS search unavailable'));

    const results = await searchUserObjects({
      basePath: '/app',
      query: 'example',
      expectedUserId: 42,
      t,
    });

    expect(results.map((result) => result.key)).toEqual(['vps:3']);
  });

  it('uses the supported addr and prefix filters for an IP query', async () => {
    vi.mocked(fetchIpAddresses).mockResolvedValue({
      data: [
        { id: 20, addr: '203.0.113.20', prefix: 32, user: { id: 42 } },
        {
          id: 21,
          addr: '203.0.113.20',
          prefix: 31,
          network_interface: {
            id: 31,
            vps: { id: 11, hostname: 'mine.example', user: { id: 42 } },
          },
        },
        { id: 22, addr: '203.0.113.20', prefix: 30 },
        { id: 23, addr: '203.0.113.20', prefix: 29, user: { id: 7 } },
        {
          id: 24,
          addr: '203.0.113.20',
          prefix: 28,
          network_interface: {
            id: 34,
            vps: { id: 12, hostname: 'foreign.example', user: { id: 7 } },
          },
        },
        {
          id: 25,
          addr: '203.0.113.20',
          prefix: 27,
          network_interface: { id: 35, vps: { id: 13, hostname: 'ambiguous.example' } },
        },
      ],
    } as unknown as Awaited<ReturnType<typeof fetchIpAddresses>>);

    const results = await searchUserObjects({
      basePath: '/app',
      query: '203.0.113.20/32',
      scopeUserId: 42,
      expectedUserId: 42,
      kinds: ['ips'],
      t,
    });

    expect(fetchIpAddresses).toHaveBeenCalledOnce();
    const options = vi.mocked(fetchIpAddresses).mock.calls[0]?.[0];
    expect(options).toMatchObject({ addr: '203.0.113.20', prefix: 32, user: 42 });
    expect(options?.includes).toBe('network_interface__vps__user,user');
    expect(options).not.toHaveProperty('q');
    expect(results.map((result) => result.key)).toEqual(['ip:20', 'ip:21']);
  });

  it('fails closed for IP results when no expected user scope is available', async () => {
    vi.mocked(fetchIpAddresses).mockResolvedValue({
      data: [{ id: 20, addr: '203.0.113.20', prefix: 32, user: { id: 42 } }],
    } as unknown as Awaited<ReturnType<typeof fetchIpAddresses>>);

    const results = await searchUserObjects({
      basePath: '/app',
      query: '203.0.113.20',
      kinds: ['ips'],
      t,
    });

    expect(results).toEqual([]);
  });

  it('uses the scoped user as the ownership boundary when expectedUserId is omitted', async () => {
    vi.mocked(fetchIpAddresses).mockResolvedValue({
      data: [
        { id: 20, addr: '203.0.113.20', prefix: 32, user: { id: 42 } },
        { id: 21, addr: '203.0.113.20', prefix: 31, user: { id: 7 } },
      ],
    } as unknown as Awaited<ReturnType<typeof fetchIpAddresses>>);

    const results = await searchUserObjects({
      basePath: '/app',
      query: '203.0.113.20',
      scopeUserId: 42,
      kinds: ['ips'],
      t,
    });

    expect(results.map((result) => result.key)).toEqual(['ip:20']);
  });

  it('loads a bounded user-scoped DNS catalog and filters names and labels locally', async () => {
    vi.mocked(fetchDnsZones).mockResolvedValue({
      data: [
        { id: 4, name: 'example.test.' },
        { id: 5, name: 'other.test.', label: 'Example.test staging' },
        { id: 6, name: 'unrelated.test.' },
      ],
    } as unknown as Awaited<ReturnType<typeof fetchDnsZones>>);

    const results = await searchUserObjects({
      basePath: '/app',
      query: 'EXAMPLE.TEST.',
      scopeUserId: 42,
      expectedUserId: 42,
      kinds: ['dns_zones'],
      limitPerGroup: 5,
      t,
    });

    expect(fetchDnsZones).toHaveBeenCalledOnce();
    const options = vi.mocked(fetchDnsZones).mock.calls[0]?.[0];
    expect(options).toMatchObject({ limit: 100, user: 42 });
    expect(options).not.toHaveProperty('q');
    expect(results.map((result) => result.key)).toEqual(['dns:4', 'dns:5']);
  });

  it('walks every DNS keyset page and caches the complete user catalog', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      id: 200 - index,
      name: `unrelated-${index}.test.`,
    }));
    vi.mocked(fetchDnsZones).mockImplementation(async (options) => ({
      data: options?.fromId === 101
        ? [{ id: 100, name: 'late.example.test.' }]
        : firstPage,
    }) as unknown as Awaited<ReturnType<typeof fetchDnsZones>>);

    const searchOptions: Parameters<typeof searchUserObjects>[0] = {
      basePath: '/app',
      query: 'late.example.test',
      scopeUserId: 43,
      expectedUserId: 43,
      kinds: ['dns_zones'],
      t,
    };
    const results = await searchUserObjects(searchOptions);

    expect(fetchDnsZones).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetchDnsZones).mock.calls[0]?.[0]).toMatchObject({ limit: 100, user: 43 });
    expect(vi.mocked(fetchDnsZones).mock.calls[1]?.[0]).toMatchObject({
      limit: 100,
      fromId: 101,
      user: 43,
    });
    expect(results.map((result) => result.key)).toEqual(['dns:100']);

    await searchUserObjects({ ...searchOptions, query: 'unrelated-2.test' });
    expect(fetchDnsZones).toHaveBeenCalledTimes(2);
  });
});
