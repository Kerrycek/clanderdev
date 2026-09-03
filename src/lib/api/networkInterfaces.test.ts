import { describe, expect, test, vi } from 'vitest';

import {
  fetchNetworkInterfaceAccountings,
  fetchNetworkInterfaceAccountingForVps,
  fetchNetworkInterfaces,
  updateNetworkInterface,
} from './networkInterfaces';

function mockFetchOk(response: any) {
  return vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: true, response }) });
}

function lastFetchCall() {
  const calls = vi.mocked(globalThis.fetch).mock.calls;
  return calls[calls.length - 1] as [string, RequestInit?];
}

describe('network interface API wrappers', () => {
  test('fetchNetworkInterfaces filters interfaces by VPS id', async () => {
    globalThis.fetch = mockFetchOk({ network_interfaces: [{ id: 1, name: 'eth0' }] }) as unknown as typeof fetch;

    const res = await fetchNetworkInterfaces(123, { limit: 25 });

    expect(res.data).toEqual([{ id: 1, name: 'eth0' }]);
    const [url, init] = lastFetchCall();
    const u = new URL(url);
    expect(u.pathname).toBe('/v7.0/network_interfaces');
    expect(init?.method).toBe('GET');
    expect(u.searchParams.get('network_interface[vps]')).toBe('123');
    expect(u.searchParams.get('network_interface[limit]')).toBe('25');
  });

  test('updateNetworkInterface sends editable fields through the network_interface namespace', async () => {
    globalThis.fetch = mockFetchOk({
      network_interface: { id: 1, name: 'eth0-renamed' },
      _meta: { action_state_id: 801 },
    }) as unknown as typeof fetch;

    await updateNetworkInterface(1, {
      name: 'eth0-renamed',
      enable: false,
      max_tx: 500 * 1024 * 1024,
      max_rx: 600 * 1024 * 1024,
    });

    const [url, init] = lastFetchCall();
    expect(new URL(url).pathname).toBe('/v7.0/network_interfaces/1');
    expect(init?.method).toBe('PUT');
    expect(JSON.parse(String(init?.body))).toEqual({
      network_interface: {
        name: 'eth0-renamed',
        enable: false,
        max_tx: 500 * 1024 * 1024,
        max_rx: 600 * 1024 * 1024,
      },
    });
  });

  test('updateNetworkInterface fails closed when blocking proof is missing', async () => {
    globalThis.fetch = mockFetchOk({ network_interface: { id: 1, name: 'eth0-renamed' } }) as unknown as typeof fetch;

    await expect(updateNetworkInterface(1, { name: 'eth0-renamed' })).rejects.toMatchObject({
      code: 'MISSING_ACTION_STATE',
    });
  });

  test('fetchNetworkInterfaceAccountingForVps scopes accounting by VPS and month', async () => {
    globalThis.fetch = mockFetchOk({ network_interface_accountings: [{ id: 9, bytes_in: 1024, bytes_out: 2048 }] }) as unknown as typeof fetch;

    const res = await fetchNetworkInterfaceAccountingForVps(123, 2026, 6);

    expect(res.data).toEqual([{ id: 9, bytes_in: 1024, bytes_out: 2048 }]);
    const [url, init] = lastFetchCall();
    const u = new URL(url);
    expect(u.pathname).toBe('/v7.0/network_interface_accountings');
    expect(init?.method).toBe('GET');
    expect(u.searchParams.get('network_interface_accounting[vps]')).toBe('123');
    expect(u.searchParams.get('network_interface_accounting[year]')).toBe('2026');
    expect(u.searchParams.get('network_interface_accounting[month]')).toBe('6');
    expect(u.searchParams.get('network_interface_accounting[limit]')).toBe('250');
  });

  test('fetchNetworkInterfaceAccountings supports monthly user traffic filters', async () => {
    globalThis.fetch = mockFetchOk({ network_interface_accountings: [{ id: 10, bytes_in: 4096, bytes_out: 8192 }] }) as unknown as typeof fetch;

    const res = await fetchNetworkInterfaceAccountings({
      user: 7,
      year: 2026,
      month: 7,
      limit: 50,
      order: 'descending',
      includes: 'network_interface,network_interface.vps',
    });

    expect(res.data).toEqual([{ id: 10, bytes_in: 4096, bytes_out: 8192 }]);
    const [url, init] = lastFetchCall();
    const u = new URL(url);
    expect(u.pathname).toBe('/v7.0/network_interface_accountings');
    expect(init?.method).toBe('GET');
    expect(u.searchParams.get('network_interface_accounting[user]')).toBe('7');
    expect(u.searchParams.get('network_interface_accounting[year]')).toBe('2026');
    expect(u.searchParams.get('network_interface_accounting[month]')).toBe('7');
    expect(u.searchParams.get('network_interface_accounting[limit]')).toBe('50');
    expect(u.searchParams.get('network_interface_accounting[order]')).toBe('descending');
    expect(u.searchParams.get('_meta[includes]')).toBe('network_interface,network_interface.vps');
  });
});
