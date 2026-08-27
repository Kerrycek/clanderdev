import { afterEach, describe, expect, test, vi } from 'vitest';

import { createExport, fetchExports, fetchHostIpAddresses } from './exports';

function setMockRuntime() {
  window.vpsAdmin = {
    api: { url: 'https://api.example.test', version: 'v7.0' },
    description: { meta: { namespace: '_meta' } },
  };
}

function mockFetchOk(response: unknown) {
  return vi.fn(async (..._args: Parameters<typeof fetch>) =>
    new Response(JSON.stringify({ status: true, response }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  );
}

function firstFetchCall(fetchMock: ReturnType<typeof mockFetchOk>): Parameters<typeof fetch> {
  return fetchMock.mock.calls[0]! as Parameters<typeof fetch>;
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.vpsAdmin = undefined;
});

describe('exports API wrappers', () => {
  test('fetchExports preserves Next UI filter params', async () => {
    setMockRuntime();
    const fetchMock = mockFetchOk({
      exports: [{ id: 1, path: '/export/spec', enabled: true }],
      _meta: { total_count: 1 },
    });
    vi.stubGlobal('fetch', fetchMock);

    await fetchExports({
      limit: 25,
      fromId: 99,
      q: 'spec',
      dataset: 123,
      user: 55,
      enabled: false,
      includes: 'dataset,snapshot,host_ip_address,user',
    });

    const [url] = firstFetchCall(fetchMock);
    const u = new URL(String(url));

    expect(u.pathname).toBe('/v7.0/exports');
    expect(u.searchParams.get('export[limit]')).toBe('25');
    expect(u.searchParams.get('export[from_id]')).toBe('99');
    expect(u.searchParams.get('export[q]')).toBe('spec');
    expect(u.searchParams.get('export[dataset]')).toBe('123');
    expect(u.searchParams.get('export[user]')).toBe('55');
    expect(u.searchParams.get('export[enabled]')).toBe('false');
    expect(u.searchParams.get('_meta[includes]')).toBe('dataset,snapshot,host_ip_address,user');
  });

  test('createExport sends export namespace', async () => {
    setMockRuntime();
    const fetchMock = mockFetchOk({ export: { id: 9, path: '/export/spec' } });
    vi.stubGlobal('fetch', fetchMock);

    await createExport({ dataset: 123, host_ip_address: 456, enabled: true, rw: true });

    const [, init] = firstFetchCall(fetchMock);
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');

    const body = JSON.parse(String(init?.body));
    expect(body).toEqual({
      export: {
        dataset: 123,
        host_ip_address: 456,
        enabled: true,
        rw: true,
      },
    });
  });

  test('fetchHostIpAddresses sends real transfer eligibility filters without unsupported search params', async () => {
    setMockRuntime();
    const fetchMock = mockFetchOk({
      host_ip_addresses: [{ id: 11, addr: '203.0.113.10' }],
    });
    vi.stubGlobal('fetch', fetchMock);

    await fetchHostIpAddresses({
      limit: 100,
      user: 55,
      purpose: 'vps',
      routed: true,
    });

    const [url] = firstFetchCall(fetchMock);
    const u = new URL(String(url));

    expect(u.pathname).toBe('/v7.0/host_ip_addresses');
    expect(u.searchParams.get('host_ip_address[limit]')).toBe('100');
    expect(u.searchParams.get('host_ip_address[user]')).toBe('55');
    expect(u.searchParams.get('host_ip_address[purpose]')).toBe('vps');
    expect(u.searchParams.get('host_ip_address[routed]')).toBe('true');
    expect(u.searchParams.has('host_ip_address[q]')).toBe(false);
    expect(u.searchParams.has('host_ip_address[assigned]')).toBe(false);
  });
});
