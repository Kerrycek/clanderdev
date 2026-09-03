import { describe, expect, test, vi } from 'vitest';

import {
  buildCreateVpsParams,
  createConsoleToken,
  createVps,
  deleteConsoleToken,
  fetchVps,
  fetchVpsList,
  fetchVpsStatuses,
  vpsBoot,
  vpsClone,
  vpsDelete,
  vpsMigrate,
  vpsReinstall,
  vpsReplace,
  vpsSwapWith,
} from './vps';

function mockFetchOk(response: any) {
  return vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: true, response }) });
}

function lastFetchCall() {
  const calls = (globalThis.fetch as any).mock.calls;
  return calls[calls.length - 1] as [string, RequestInit?];
}

describe('vps API wrappers', () => {
  test('buildCreateVpsParams returns exact legacy admin create params', () => {
    const params = buildCreateVpsParams({
      mode: 'admin',
      user: 1,
      node: 5,
      hostname: 'my-vps',
      os_template: 6,
      start: true,
      info: 'admin note',
      cpu: 2,
      memory: 2048,
      diskspace: 20480,
      swap: 512,
      ipv4: 1,
      ipv6: 1,
      ipv4_private: 0,
      environment: 2,
      location: 3,
      address_location: 4,
      onstartall: true,
    } as any);

    expect(params).toEqual({
      hostname: 'my-vps',
      os_template: 6,
      start: true,
      cpu: 2,
      memory: 2048,
      diskspace: 20480,
      swap: 512,
      ipv4: 1,
      ipv6: 1,
      ipv4_private: 0,
      info: 'admin note',
      user: 1,
      node: 5,
    });
    expect(params).not.toHaveProperty('environment');
    expect(params).not.toHaveProperty('location');
    expect(params).not.toHaveProperty('address_location');
    expect(params).not.toHaveProperty('onstartall');
  });

  test('fetchVpsList forwards list filters', async () => {
    globalThis.fetch = mockFetchOk({ vpses: [], _meta: { total_count: 0 } }) as any;

    await fetchVpsList({
      limit: 25,
      fromId: 123,
      hostnameAny: 'db',
      user: 42,
      node: 7,
      userNamespaceMap: 3,
      location: 2,
      environment: 9,
      includes: 'node__location,user',
    });

    const [url] = lastFetchCall();
    const u = new URL(url);

    expect(u.pathname).toBe('/v7.0/vpses');
    expect(u.searchParams.get('vps[limit]')).toBe('25');
    expect(u.searchParams.get('vps[from_id]')).toBe('123');
    expect(u.searchParams.get('vps[hostname_any]')).toBe('db');
    expect(u.searchParams.get('vps[user]')).toBe('42');
    expect(u.searchParams.get('vps[node]')).toBe('7');
    expect(u.searchParams.get('vps[user_namespace_map]')).toBe('3');
    expect(u.searchParams.get('vps[location]')).toBe('2');
    expect(u.searchParams.get('vps[environment]')).toBe('9');
    expect(u.searchParams.get('_meta[includes]')).toBe('node__location,user');
  });

  test('fetchVpsStatuses forwards time-window and cursor params', async () => {
    globalThis.fetch = mockFetchOk({ statuses: [], _meta: { total_count: 0 } }) as any;

    await fetchVpsStatuses(321, {
      limit: 80,
      fromId: 456,
      from: '2026-03-01T00:00:00Z',
      to: '2026-03-08T00:00:00Z',
    });

    const [url] = lastFetchCall();
    const u = new URL(url);

    expect(u.pathname).toBe('/v7.0/vpses/321/statuses');
    expect(u.searchParams.get('status[limit]')).toBe('80');
    expect(u.searchParams.get('status[from_id]')).toBe('456');
    expect(u.searchParams.get('status[from]')).toBe('2026-03-01T00:00:00Z');
    expect(u.searchParams.get('status[to]')).toBe('2026-03-08T00:00:00Z');
  });

  test('fetchVps forwards include meta', async () => {
    globalThis.fetch = mockFetchOk({ vps: { id: 1 } }) as any;

    await fetchVps(1, { includes: 'user,node,dataset' });

    const [url] = lastFetchCall();
    const u = new URL(url);

    expect(u.pathname).toBe('/v7.0/vpses/1');
    expect(u.searchParams.get('_meta[includes]')).toBe('user,node,dataset');
  });

  test('createVps posts admin create payload matching legacy vpsAdmin shape', async () => {
    globalThis.fetch = mockFetchOk({ vps: { id: 150 }, _meta: { action_state_id: 1500 } }) as unknown as typeof fetch;

    await createVps({
      mode: 'admin',
      user: 1,
      environment: 2,
      location: 3,
      address_location: 4,
      node: 5,
      hostname: 'my-vps',
      os_template: 6,
      onstartall: true,
      start: true,
      info: 'admin note',
      cpu: 2,
      memory: 2048,
      diskspace: 20480,
      swap: 512,
      ipv4: 1,
      ipv6: 1,
      ipv4_private: 0,
    } as any);

    const [url, init] = lastFetchCall();
    const body = JSON.parse(String(init?.body));

    expect(new URL(url).pathname).toBe('/v7.0/vpses');
    expect(init?.method).toBe('POST');
    expect(body).toEqual({
      vps: {
        user: 1,
        node: 5,
        info: 'admin note',
        hostname: 'my-vps',
        os_template: 6,
        start: true,
        cpu: 2,
        memory: 2048,
        diskspace: 20480,
        swap: 512,
        ipv4: 1,
        ipv6: 1,
        ipv4_private: 0,
      },
    });
    expect(body.vps).not.toHaveProperty('environment');
    expect(body.vps).not.toHaveProperty('location');
    expect(body.vps).not.toHaveProperty('address_location');
    expect(body.vps).not.toHaveProperty('onstartall');
  });

  test('createVps posts user create payload without admin-only fields', async () => {
    globalThis.fetch = mockFetchOk({ vps: { id: 151 }, _meta: { action_state_id: 1510 } }) as unknown as typeof fetch;

    await createVps({
      mode: 'user',
      environment: 2,
      location: 3,
      address_location: 4,
      hostname: 'user-vps',
      os_template: 6,
      start: true,
      cpu: 2,
      memory: 2048,
      diskspace: 20480,
      swap: 512,
      ipv4: 1,
      ipv6: 1,
      ipv4_private: 0,
      user: 1,
      node: 5,
      onstartall: true,
      info: 'not for user mode',
    } as any);

    const [url, init] = lastFetchCall();
    const body = JSON.parse(String(init?.body));

    expect(new URL(url).pathname).toBe('/v7.0/vpses');
    expect(init?.method).toBe('POST');
    expect(body).toEqual({
      vps: {
        environment: 2,
        location: 3,
        hostname: 'user-vps',
        os_template: 6,
        start: true,
        cpu: 2,
        memory: 2048,
        diskspace: 20480,
        swap: 512,
        ipv4: 1,
        ipv6: 1,
        ipv4_private: 0,
      },
    });
    expect(body.vps).not.toHaveProperty('address_location');
    expect(body.vps).not.toHaveProperty('node');
    expect(body.vps).not.toHaveProperty('user');
    expect(body.vps).not.toHaveProperty('onstartall');
    expect(body.vps).not.toHaveProperty('info');
  });

  test('vpsClone posts legacy clone payload', async () => {
    globalThis.fetch = mockFetchOk({ vps: { id: 160 }, _meta: { action_state_id: 1600 } }) as unknown as typeof fetch;

    await vpsClone(12, {
      user: 1,
      node: 5,
      hostname: 'source-12-clone',
      subdatasets: true,
      dataset_plans: true,
      resources: true,
      features: false,
      stop: true,
    });

    const [url, init] = lastFetchCall();
    const body = JSON.parse(String(init?.body));

    expect(new URL(url).pathname).toBe('/v7.0/vpses/12/clone');
    expect(init?.method).toBe('POST');
    expect(body).toEqual({
      vps: {
        user: 1,
        node: 5,
        hostname: 'source-12-clone',
        subdatasets: true,
        dataset_plans: true,
        resources: true,
        features: false,
        stop: true,
      },
    });
  });

  test('vpsClone can post user playground target environment and location', async () => {
    globalThis.fetch = mockFetchOk({ vps: { id: 161 }, _meta: { action_state_id: 1610 } }) as unknown as typeof fetch;

    await vpsClone(12, {
      hostname: 'source-12-playground',
      environment: 9,
      location: 2,
      subdatasets: true,
      dataset_plans: true,
      resources: true,
      features: true,
      stop: true,
    });

    const [url, init] = lastFetchCall();
    const body = JSON.parse(String(init?.body));

    expect(new URL(url).pathname).toBe('/v7.0/vpses/12/clone');
    expect(init?.method).toBe('POST');
    expect(body).toEqual({
      vps: {
        hostname: 'source-12-playground',
        environment: 9,
        location: 2,
        subdatasets: true,
        dataset_plans: true,
        resources: true,
        features: true,
        stop: true,
      },
    });
  });

  test('vpsSwapWith posts legacy swap payload', async () => {
    globalThis.fetch = mockFetchOk({ _meta: { action_state_id: 3370 } }) as unknown as typeof fetch;

    await vpsSwapWith(12, {
      vps: 14,
      hostname: true,
      resources: true,
      expirations: false,
    });

    const [url, init] = lastFetchCall();
    const body = JSON.parse(String(init?.body));

    expect(new URL(url).pathname).toBe('/v7.0/vpses/12/swap_with');
    expect(init?.method).toBe('POST');
    expect(body).toEqual({
      vps: {
        vps: 14,
        hostname: true,
        resources: true,
        expirations: false,
      },
    });
  });

  test('vpsReplace posts legacy admin replace payload', async () => {
    globalThis.fetch = mockFetchOk({ vps: { id: 12 }, _meta: { action_state_id: 3620 } }) as unknown as typeof fetch;

    await vpsReplace(12, {
      node: 5,
      expiration_date: '2026-07-25T12:00:00.000Z',
      start: true,
      reason: 'test replacement',
    });

    const [url, init] = lastFetchCall();
    const body = JSON.parse(String(init?.body));

    expect(new URL(url).pathname).toBe('/v7.0/vpses/12/replace');
    expect(init?.method).toBe('POST');
    expect(body).toEqual({
      vps: {
        node: 5,
        expiration_date: '2026-07-25T12:00:00.000Z',
        start: true,
        reason: 'test replacement',
      },
    });
  });

  test('vpsBoot posts legacy rescue boot payload', async () => {
    globalThis.fetch = mockFetchOk({ _meta: { action_state_id: 3870 } }) as unknown as typeof fetch;

    await vpsBoot(12, {
      os_template: 6,
      mount_root_dataset: '/mnt/vps',
    });

    const [url, init] = lastFetchCall();
    const body = JSON.parse(String(init?.body));

    expect(new URL(url).pathname).toBe('/v7.0/vpses/12/boot');
    expect(init?.method).toBe('POST');
    expect(body).toEqual({
      vps: {
        os_template: 6,
        mount_root_dataset: '/mnt/vps',
      },
    });
  });

  test('vpsReinstall posts legacy reinstall payload', async () => {
    globalThis.fetch = mockFetchOk({ _meta: { action_state_id: 4080 } }) as unknown as typeof fetch;

    await vpsReinstall(12, { os_template: 6 });

    const [url, init] = lastFetchCall();
    const body = JSON.parse(String(init?.body));

    expect(new URL(url).pathname).toBe('/v7.0/vpses/12/reinstall');
    expect(init?.method).toBe('POST');
    expect(body).toEqual({
      vps: {
        os_template: 6,
      },
    });
  });

  test('vpsMigrate posts legacy migration payload', async () => {
    globalThis.fetch = mockFetchOk({ _meta: { action_state_id: 4250 } }) as unknown as typeof fetch;

    await vpsMigrate(12, {
      node: 7,
      transfer_ip_addresses: true,
      replace_ip_addresses: false,
      maintenance_window: false,
      finish_weekday: 1,
      finish_minutes: 180,
      stop_on_error: true,
      cleanup_data: true,
      send_mail: true,
    });

    const [url, init] = lastFetchCall();
    const body = JSON.parse(String(init?.body));

    expect(new URL(url).pathname).toBe('/v7.0/vpses/12/migrate');
    expect(init?.method).toBe('POST');
    expect(body).toEqual({
      vps: {
        node: 7,
        transfer_ip_addresses: true,
        replace_ip_addresses: false,
        maintenance_window: false,
        finish_weekday: 1,
        finish_minutes: 180,
        stop_on_error: true,
        cleanup_data: true,
        send_mail: true,
      },
    });
  });

  test('vpsDelete sends lazy delete payload through vps namespace', async () => {
    globalThis.fetch = mockFetchOk({ _meta: { action_state_id: 4600 } }) as unknown as typeof fetch;

    await vpsDelete(12, { lazy: true });

    const [url, init] = lastFetchCall();
    const body = JSON.parse(String(init?.body));

    expect(new URL(url).pathname).toBe('/v7.0/vpses/12');
    expect(init?.method).toBe('DELETE');
    expect(body).toEqual({
      vps: {
        lazy: true,
      },
    });
  });

  test('console token lifecycle calls the legacy VPS console_token action', async () => {
    globalThis.fetch = mockFetchOk({ console_token: { token: 'T1', expiration: '2027-01-01T00:00:00Z' } }) as any;

    await createConsoleToken(12);

    let [url, init] = lastFetchCall();
    expect(new URL(url).pathname).toBe('/v7.0/vpses/12/console_token');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({});

    await deleteConsoleToken(12);

    [url, init] = lastFetchCall();
    expect(new URL(url).pathname).toBe('/v7.0/vpses/12/console_token');
    expect(init?.method).toBe('DELETE');
    expect(JSON.parse(String(init?.body))).toEqual({});
  });
});
