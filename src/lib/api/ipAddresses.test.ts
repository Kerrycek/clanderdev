import { describe, expect, test, vi } from 'vitest';

import {
  assignIpAddressRoute,
  assignIpAddressRouteWithHostAddress,
  fetchIpAddresses,
  fetchIpAddressesForVps,
  freeIpAddressRoute,
  updateIpAddress,
} from './ipAddresses';
import {
  assignHostIpAddress,
  createHostIpAddress,
  deleteHostIpAddress,
  fetchIpAddressAssignments,
  freeHostIpAddress,
  updateHostIpAddress,
} from './networking';

function mockFetchOk(response: any) {
  return vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: true, response }) });
}

function lastFetchCall() {
  const calls = vi.mocked(globalThis.fetch).mock.calls;
  return calls[calls.length - 1] as [string, RequestInit?];
}

describe('network address API wrappers', () => {
  test('fetchIpAddresses forwards purpose and include filters used by admin networking', async () => {
    globalThis.fetch = mockFetchOk({ ip_addresses: [] }) as typeof fetch;

    await fetchIpAddresses({
      limit: 50,
      purpose: 'vps',
      includes: 'network,network_interface,vps,user',
    });

    const [url] = lastFetchCall();
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/v7.0/ip_addresses');
    expect(parsed.searchParams.get('ip_address[purpose]')).toBe('vps');
    expect(parsed.searchParams.has('ip_address[order]')).toBe(false);
    expect(parsed.searchParams.get('_meta[includes]')).toBe('network,network_interface,vps,user');
  });

  test('fetchIpAddresses forwards network and assignment filters', async () => {
    globalThis.fetch = mockFetchOk({ ip_addresses: [] }) as typeof fetch;

    await fetchIpAddresses({
      network: 12,
      assignedToInterface: false,
    });

    const [url] = lastFetchCall();
    const parsed = new URL(url);

    expect(parsed.searchParams.get('ip_address[network]')).toBe('12');
    expect(parsed.searchParams.get('ip_address[assigned_to_interface]')).toBe('false');
  });

  test('fetchIpAddresses can request ownerless addresses in ascending order', async () => {
    globalThis.fetch = mockFetchOk({ ip_addresses: [] }) as typeof fetch;

    await fetchIpAddresses({ user: null, assignedToInterface: false, order: 'asc' });

    const [url] = lastFetchCall();
    const parsed = new URL(url);
    expect(parsed.searchParams.has('ip_address[user]')).toBe(true);
    expect(parsed.searchParams.get('ip_address[user]')).toBe('');
    expect(parsed.searchParams.get('ip_address[assigned_to_interface]')).toBe('false');
    expect(parsed.searchParams.get('ip_address[order]')).toBe('asc');
  });

  test('fetchIpAddresses forwards cancellation to the HaveAPI request', async () => {
    globalThis.fetch = mockFetchOk({ ip_addresses: [] }) as typeof fetch;
    const controller = new AbortController();

    await fetchIpAddresses({ signal: controller.signal });

    const [, init] = lastFetchCall();
    expect(init?.signal).toBe(controller.signal);
  });

  test('fetchIpAddressesForVps forwards the VPS scope and custom includes', async () => {
    globalThis.fetch = mockFetchOk({ ip_addresses: [] }) as typeof fetch;

    await fetchIpAddressesForVps(123, {
      limit: 250,
      includes: 'network__primary_location__environment,network_interface__vps,user',
    });

    const [url] = lastFetchCall();
    const parsed = new URL(url);

    expect(parsed.searchParams.get('ip_address[vps]')).toBe('123');
    expect(parsed.searchParams.get('ip_address[limit]')).toBe('250');
    expect(parsed.searchParams.get('_meta[includes]')).toBe(
      'network__primary_location__environment,network_interface__vps,user'
    );
  });

  test('fetchIpAddressAssignments supports one active user-scoped request with nested address data', async () => {
    globalThis.fetch = mockFetchOk({ ip_address_assignments: [] }) as typeof fetch;

    await fetchIpAddressAssignments({
      user: 7,
      active: true,
      limit: 250,
      includes: 'ip_address__network__primary_location__environment,ip_address__network_interface__vps,user,vps',
    });

    const [url] = lastFetchCall();
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/v7.0/ip_address_assignments');
    expect(parsed.searchParams.get('ip_address_assignment[user]')).toBe('7');
    expect(parsed.searchParams.get('ip_address_assignment[active]')).toBe('true');
    expect(parsed.searchParams.get('ip_address_assignment[limit]')).toBe('250');
    expect(parsed.searchParams.get('_meta[includes]')).toBe(
      'ip_address__network__primary_location__environment,ip_address__network_interface__vps,user,vps'
    );
  });

  test('assignIpAddressRoute posts the legacy route assign payload', async () => {
    globalThis.fetch = mockFetchOk({ ip_address: { id: 42 } }) as typeof fetch;

    await assignIpAddressRoute(42, { network_interface: 501, route_via: 700 });

    const [url, init] = lastFetchCall();
    expect(new URL(url).pathname).toBe('/v7.0/ip_addresses/42/assign');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      ip_address: {
        network_interface: 501,
        route_via: 700,
      },
    });
  });

  test('assignIpAddressRouteWithHostAddress posts the combined route and host action', async () => {
    globalThis.fetch = mockFetchOk({ ip_address: { id: 42 } }) as typeof fetch;

    await assignIpAddressRouteWithHostAddress(42, { network_interface: 501 });

    const [url, init] = lastFetchCall();
    expect(new URL(url).pathname).toBe('/v7.0/ip_addresses/42/assign_with_host_address');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      ip_address: {
        network_interface: 501,
      },
    });
  });

  test('freeIpAddressRoute posts route free without a namespaced payload', async () => {
    globalThis.fetch = mockFetchOk({ ip_address: { id: 42 } }) as typeof fetch;

    await freeIpAddressRoute(42);

    const [url, init] = lastFetchCall();
    expect(new URL(url).pathname).toBe('/v7.0/ip_addresses/42/free');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe('{}');
  });

  test('updateIpAddress sends owner changes through the ip_address namespace', async () => {
    globalThis.fetch = mockFetchOk({ ip_address: { id: 42 } }) as typeof fetch;

    await updateIpAddress(42, { user: 7, environment: 2 });

    const [url, init] = lastFetchCall();
    expect(new URL(url).pathname).toBe('/v7.0/ip_addresses/42');
    expect(init?.method).toBe('PUT');
    expect(JSON.parse(String(init?.body))).toEqual({
      ip_address: {
        user: 7,
        environment: 2,
      },
    });
  });

  test('host IP wrappers cover create, PTR update, assign, free and delete endpoints', async () => {
    globalThis.fetch = mockFetchOk({ host_ip_address: { id: 9 } }) as typeof fetch;

    await createHostIpAddress({ ip_address: 42, addr: '192.0.2.10' });
    let [url, init] = lastFetchCall();
    expect(new URL(url).pathname).toBe('/v7.0/host_ip_addresses');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      host_ip_address: {
        ip_address: 42,
        addr: '192.0.2.10',
      },
    });

    await updateHostIpAddress(9, { reverse_record_value: 'host.example.org.' });
    [url, init] = lastFetchCall();
    expect(new URL(url).pathname).toBe('/v7.0/host_ip_addresses/9');
    expect(init?.method).toBe('PUT');
    expect(JSON.parse(String(init?.body))).toEqual({
      host_ip_address: {
        reverse_record_value: 'host.example.org.',
      },
    });

    await assignHostIpAddress(9, { network_interface: 501 });
    [url, init] = lastFetchCall();
    expect(new URL(url).pathname).toBe('/v7.0/host_ip_addresses/9/assign');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      host_ip_address: {
        network_interface: 501,
      },
    });

    await freeHostIpAddress(9);
    [url, init] = lastFetchCall();
    expect(new URL(url).pathname).toBe('/v7.0/host_ip_addresses/9/free');
    expect(init?.method).toBe('POST');

    await deleteHostIpAddress(9);
    [url, init] = lastFetchCall();
    expect(new URL(url).pathname).toBe('/v7.0/host_ip_addresses/9');
    expect(init?.method).toBe('DELETE');
  });
});
