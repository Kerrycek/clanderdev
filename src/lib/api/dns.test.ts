import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  createDnsTsigKey,
  createDnsRecord,
  fetchDnsRecordLogs,
  fetchDnsRecords,
  fetchDnsServerZoneTransferLogs,
  fetchDnsServers,
  fetchDnsTsigKeys,
  fetchDnsZoneTransfers,
  fetchDnsZones,
} from './dns';

function mockFetchOk(response: unknown) {
  return vi.fn(async (..._args: Parameters<typeof fetch>) =>
    new Response(JSON.stringify({ status: true, response }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  );
}

function lastFetchCall(fetchMock: ReturnType<typeof mockFetchOk>): Parameters<typeof fetch> {
  return fetchMock.mock.calls[fetchMock.mock.calls.length - 1]! as Parameters<typeof fetch>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('dns API wrappers', () => {
  test('fetchDnsZones uses dns_zone namespace', async () => {
    const fetchMock = mockFetchOk({ dns_zones: [], _meta: { total_count: 0 } });
    vi.stubGlobal('fetch', fetchMock);

    await fetchDnsZones({ limit: 5 });

    const [url] = lastFetchCall(fetchMock);
    const u = new URL(String(url));

    expect(u.pathname).toBe('/v7.0/dns_zones');
    expect(u.searchParams.get('dns_zone[limit]')).toBe('5');
  });

  test('fetchDnsZones forwards only supported user and dnssec filters', async () => {
    const fetchMock = mockFetchOk({ dns_zones: [], _meta: { total_count: 0 } });
    vi.stubGlobal('fetch', fetchMock);

    const optionsWithUnsupportedQ = { q: 'example', user: 42, dnssec_enabled: true };
    await fetchDnsZones(optionsWithUnsupportedQ);

    const [url] = lastFetchCall(fetchMock);
    const u = new URL(String(url));

    expect(u.searchParams.has('dns_zone[q]')).toBe(false);
    expect(u.searchParams.get('dns_zone[user]')).toBe('42');
    expect(u.searchParams.get('dns_zone[dnssec_enabled]')).toBe('true');
  });

  test('fetchDnsRecords filters by dns_zone', async () => {
    const fetchMock = mockFetchOk({ dns_records: [], _meta: { total_count: 0 } });
    vi.stubGlobal('fetch', fetchMock);

    await fetchDnsRecords({ dns_zone: 123, limit: 10 });

    const [url] = lastFetchCall(fetchMock);
    const u = new URL(String(url));

    expect(u.pathname).toBe('/v7.0/dns_records');
    expect(u.searchParams.get('dns_record[dns_zone]')).toBe('123');
    expect(u.searchParams.get('dns_record[limit]')).toBe('10');
  });

  test('fetchDnsRecords never sends the unsupported q filter', async () => {
    const fetchMock = mockFetchOk({ dns_records: [], _meta: { total_count: 0 } });
    vi.stubGlobal('fetch', fetchMock);

    const optionsWithUnsupportedQ = { dns_zone: 123, q: 'mail' };
    await fetchDnsRecords(optionsWithUnsupportedQ);

    const [url] = lastFetchCall(fetchMock);
    const u = new URL(String(url));

    expect(u.searchParams.has('dns_record[q]')).toBe(false);
  });

  test('createDnsRecord sends namespaced payload', async () => {
    const fetchMock = mockFetchOk({ dns_record: { id: 1 } });
    vi.stubGlobal('fetch', fetchMock);

    await createDnsRecord({ dns_zone: 123, name: 'www', type: 'A', content: '203.0.113.10' });

    const [url, init] = lastFetchCall(fetchMock);
    const u = new URL(String(url));

    expect(u.pathname).toBe('/v7.0/dns_records');
    expect(init?.method).toBe('POST');

    const body = JSON.parse(String(init?.body));
    expect(body).toEqual({ dns_record: { dns_zone: 123, name: 'www', type: 'A', content: '203.0.113.10' } });
  });

  test('fetchDnsRecordLogs uses dns_record_log namespace', async () => {
    const fetchMock = mockFetchOk({ dns_record_logs: [], _meta: { total_count: 0 } });
    vi.stubGlobal('fetch', fetchMock);

    await fetchDnsRecordLogs({ dns_zone: 123, limit: 1 });

    const [url] = lastFetchCall(fetchMock);
    const u = new URL(String(url));

    expect(u.pathname).toBe('/v7.0/dns_record_logs');
    expect(u.searchParams.get('dns_record_log[dns_zone]')).toBe('123');
    expect(u.searchParams.get('dns_record_log[limit]')).toBe('1');
  });

  test('fetchDnsServers never forwards unsupported list filters', async () => {
    const fetchMock = mockFetchOk({ dns_servers: [], _meta: { total_count: 0 } });
    vi.stubGlobal('fetch', fetchMock);

    const optionsWithUnsupportedFilters = {
      q: 'ns1',
      hidden: false,
      enable_user_dns_zones: true,
      count: true,
    };
    await fetchDnsServers(optionsWithUnsupportedFilters);

    const [url] = lastFetchCall(fetchMock);
    const u = new URL(String(url));

    expect(u.pathname).toBe('/v7.0/dns_servers');
    expect(u.searchParams.get('dns_server[q]')).toBeNull();
    expect(u.searchParams.get('dns_server[hidden]')).toBeNull();
    expect(u.searchParams.get('dns_server[enable_user_dns_zones]')).toBeNull();
    expect(u.searchParams.get('_meta[count]')).toBe('true');
  });

  test('fetchDnsTsigKeys forwards only supported algorithm and user filters', async () => {
    const fetchMock = mockFetchOk({ dns_tsig_keys: [], _meta: { total_count: 0 } });
    vi.stubGlobal('fetch', fetchMock);

    const optionsWithUnsupportedQ = { q: 'alice', algorithm: 'hmac-sha512', user: 7 };
    await fetchDnsTsigKeys({ ...optionsWithUnsupportedQ, count: true });

    const [url] = lastFetchCall(fetchMock);
    const u = new URL(String(url));

    expect(u.pathname).toBe('/v7.0/dns_tsig_keys');
    expect(u.searchParams.has('dns_tsig_key[q]')).toBe(false);
    expect(u.searchParams.get('dns_tsig_key[algorithm]')).toBe('hmac-sha512');
    expect(u.searchParams.get('dns_tsig_key[user]')).toBe('7');
    expect(u.searchParams.get('_meta[count]')).toBe('true');
  });

  test('fetchDnsTsigKeys strips secrets from list results before returning them', async () => {
    const fetchMock = mockFetchOk({
      dns_tsig_keys: [
        {
          id: 11,
          name: 'transfer.example',
          algorithm: 'hmac-sha256',
          secret: 'must-not-enter-query-cache',
          user: { id: 7, login: 'alice' },
        },
      ],
      _meta: {
        total_count: 1,
        debug: { secret: 'must-not-survive-in-meta' },
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchDnsTsigKeys({ limit: 10 });

    expect(result.data).toEqual([
      {
        id: 11,
        name: 'transfer.example',
        algorithm: 'hmac-sha256',
        user: { id: 7, login: 'alice' },
      },
    ]);
    expect(result.data[0]).not.toHaveProperty('secret');
    expect(JSON.stringify(result)).not.toContain('must-not-enter-query-cache');
    expect(JSON.stringify(result)).not.toContain('must-not-survive-in-meta');
    expect(JSON.stringify(result)).not.toContain('"secret"');
  });

  test('createDnsTsigKey reveals the new secret through the one-time sink and returns only a scrubbed result', async () => {
    const fetchMock = mockFetchOk({
      dns_tsig_key: {
        id: 12,
        name: 'new-transfer-key',
        algorithm: 'hmac-sha256',
        secret: 'one-time-create-secret',
      },
      _meta: {
        action_state_id: 99,
        audit: { secret: 'meta-copy-of-create-secret' },
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    let revealed: { name: string; secret: string } | undefined;

    const result = await createDnsTsigKey(
      { name: 'new-transfer-key', algorithm: 'hmac-sha256' },
      { onOneTimeSecret: (value) => { revealed = value; } }
    );

    expect(revealed).toEqual({ name: 'new-transfer-key', secret: 'one-time-create-secret' });
    expect(result.data).not.toHaveProperty('secret');
    expect(result.meta).toMatchObject({ action_state_id: 99 });
    expect(JSON.stringify(result)).not.toContain('one-time-create-secret');
    expect(JSON.stringify(result)).not.toContain('meta-copy-of-create-secret');
    expect(JSON.stringify(result)).not.toContain('"secret"');
  });

  test('fetchDnsZoneTransfers strips nested TSIG secrets from data, metadata and the HaveAPI envelope', async () => {
    const fetchMock = mockFetchOk({
      dns_zone_transfers: [{
        id: 21,
        dns_zone: { id: 3 },
        dns_tsig_key: {
          id: 4,
          name: 'nested-key',
          secret: 'nested-transfer-secret',
        },
      }],
      _meta: { debug: { secret: 'transfer-meta-secret' } },
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchDnsZoneTransfers({ dns_zone: 3 });

    expect(result.data[0]?.dns_tsig_key).toMatchObject({ id: 4, name: 'nested-key' });
    expect(result.data[0]?.dns_tsig_key).not.toHaveProperty('secret');
    expect(JSON.stringify(result)).not.toContain('nested-transfer-secret');
    expect(JSON.stringify(result)).not.toContain('transfer-meta-secret');
    expect(JSON.stringify(result)).not.toContain('"secret"');
  });

  test('fetchDnsServerZoneTransferLogs uses the real transfer log endpoint', async () => {
    const fetchMock = mockFetchOk({
      dns_server_zone_transfer_logs: [],
      _meta: { total_count: 0 },
    });
    vi.stubGlobal('fetch', fetchMock);

    await fetchDnsServerZoneTransferLogs({
      dns_zone: 123,
      dns_server_zone: 456,
      status: 'failed',
      order: 'latest',
      limit: 25,
    });

    const [url] = lastFetchCall(fetchMock);
    const u = new URL(String(url));

    expect(u.pathname).toBe('/v7.0/dns_server_zone_transfer_logs');
    expect(u.searchParams.get('dns_server_zone_transfer_log[dns_zone]')).toBe('123');
    expect(u.searchParams.get('dns_server_zone_transfer_log[dns_server_zone]')).toBe('456');
    expect(u.searchParams.get('dns_server_zone_transfer_log[status]')).toBe('failed');
    expect(u.searchParams.get('dns_server_zone_transfer_log[order]')).toBe('latest');
    expect(u.searchParams.get('dns_server_zone_transfer_log[limit]')).toBe('25');
  });
});
