import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  createSecurityAdvisory,
  createSecurityAdvisoryCve,
  createSecurityAdvisoryNodeStatus,
  createSecurityAdvisoryOutageLink,
  createSecurityAdvisoryUpdate,
  deleteSecurityAdvisoryCve,
  deleteSecurityAdvisoryNodeStatus,
  deleteSecurityAdvisoryOutageLink,
  deleteSecurityAdvisoryUpdate,
  fetchAllSecurityAdvisories,
  fetchSecurityAdvisories,
  fetchSecurityAdvisory,
  fetchAllSecurityAdvisoryUpdates,
  fetchSecurityAdvisoryAffectedUsers,
  fetchSecurityAdvisoryAffectedVps,
  fetchSecurityAdvisoryCve,
  fetchSecurityAdvisoryCves,
  fetchSecurityAdvisoryNodeStatuses,
  fetchSecurityAdvisoryOutageLink,
  fetchSecurityAdvisoryOutageLinks,
  fetchSecurityAdvisoryUpdate,
  fetchSecurityAdvisoryUpdates,
  publishSecurityAdvisory,
  rebuildSecurityAdvisoryAffectedVps,
  updateSecurityAdvisory,
  updateSecurityAdvisoryCve,
  updateSecurityAdvisoryNodeStatus,
  updateSecurityAdvisoryUpdate,
} from './securityAdvisories';

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

function requestPath(fetchMock: ReturnType<typeof mockFetchOk>): string {
  return new URL(String(lastFetchCall(fetchMock)[0])).pathname;
}

function requestBody(fetchMock: ReturnType<typeof mockFetchOk>): unknown {
  return JSON.parse(String(lastFetchCall(fetchMock)[1]?.body));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('security advisory API wrappers', () => {
  test('list and show use the security advisory routes and filters', async () => {
    const fetchMock = mockFetchOk({ security_advisories: [], _meta: { total_count: 0 } });
    vi.stubGlobal('fetch', fetchMock);

    await fetchSecurityAdvisories({
      state: 'draft',
      affected: false,
      cve: 'CVE-2026-12345',
      recentSince: '2026-07-01T00:00:00Z',
      userId: 7,
      vpsId: 8,
      nodeId: 9,
      since: '2026-06-01T00:00:00Z',
      order: 'oldest',
      limit: 25,
      fromId: 100,
      count: true,
      includes: 'created_by,published_by',
    });

    let [url] = lastFetchCall(fetchMock);
    let parsed = new URL(String(url));
    expect(parsed.pathname).toBe('/v7.0/security_advisories');
    expect(parsed.searchParams.get('security_advisory[state]')).toBe('draft');
    expect(parsed.searchParams.get('security_advisory[affected]')).toBe('false');
    expect(parsed.searchParams.get('security_advisory[cve]')).toBe('CVE-2026-12345');
    expect(parsed.searchParams.get('security_advisory[recent_since]')).toBe('2026-07-01T00:00:00Z');
    expect(parsed.searchParams.get('security_advisory[user]')).toBe('7');
    expect(parsed.searchParams.get('security_advisory[vps]')).toBe('8');
    expect(parsed.searchParams.get('security_advisory[node]')).toBe('9');
    expect(parsed.searchParams.get('security_advisory[since]')).toBe('2026-06-01T00:00:00Z');
    expect(parsed.searchParams.get('security_advisory[order]')).toBe('oldest');
    expect(parsed.searchParams.get('security_advisory[limit]')).toBe('25');
    expect(parsed.searchParams.get('security_advisory[from_id]')).toBe('100');
    expect(parsed.searchParams.get('_meta[includes]')).toBe('created_by,published_by');
    expect(parsed.searchParams.get('_meta[count]')).toBe('true');

    await fetchSecurityAdvisory(44, { includes: 'created_by' });
    [url] = lastFetchCall(fetchMock);
    parsed = new URL(String(url));
    expect(parsed.pathname).toBe('/v7.0/security_advisories/44');
    expect(parsed.searchParams.get('_meta[includes]')).toBe('created_by');
  });

  test('fetches every advisory cursor page while preserving state, order and includes', async () => {
    const pages = [
      [{ id: 5, state: 'published' }, { id: 4, state: 'published' }],
      [{ id: 4, state: 'published' }, { id: 3, state: 'published' }],
      [{ id: 2, state: 'published' }],
    ];
    const fetchMock = vi.fn(async (..._args: Parameters<typeof fetch>) => {
      const page = pages[fetchMock.mock.calls.length - 1] ?? [];
      return new Response(JSON.stringify({
        status: true,
        response: { security_advisories: page },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchAllSecurityAdvisories({
      state: 'published',
      order: 'newest',
      includes: 'created_by',
      limit: 2,
      maxPages: 10,
    });

    expect(result.data.map((advisory) => advisory.id)).toEqual([5, 4, 3, 2]);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const requests = fetchMock.mock.calls.map(([url]) => new URL(String(url)));
    expect(requests.map((request) => request.searchParams.get('security_advisory[from_id]')))
      .toEqual([null, '4', '3']);
    for (const request of requests) {
      expect(request.searchParams.get('security_advisory[state]')).toBe('published');
      expect(request.searchParams.get('security_advisory[order]')).toBe('newest');
      expect(request.searchParams.get('security_advisory[limit]')).toBe('2');
      expect(request.searchParams.get('_meta[includes]')).toBe('created_by');
    }
  });

  test('fails instead of silently truncating when advisory pagination stalls', async () => {
    const fetchMock = mockFetchOk({ security_advisories: [{ id: 9 }, { id: 8 }] });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchAllSecurityAdvisories({ limit: 2, maxPages: 50 }))
      .rejects.toThrow('pagination stalled before the archive was complete');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('fails instead of returning an archive truncated by the advisory page guard', async () => {
    let nextId = 20;
    const fetchMock = vi.fn(async (..._args: Parameters<typeof fetch>) => {
      const page = [{ id: nextId }, { id: nextId - 1 }];
      nextId -= 2;
      return new Response(JSON.stringify({
        status: true,
        response: { security_advisories: page },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchAllSecurityAdvisories({ limit: 2, maxPages: 2 }))
      .rejects.toThrow('pagination exceeded its safety limit');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('create, update, publish and rebuild use their API contracts', async () => {
    const fetchMock = mockFetchOk({ security_advisory: { id: 44 } });
    vi.stubGlobal('fetch', fetchMock);

    await createSecurityAdvisory({
      name: 'Dirty Pipe',
      published_at: null,
      en_summary: 'Kernel vulnerability',
      cs_summary: 'Zranitelnost kernelu',
    });
    expect(requestPath(fetchMock)).toBe('/v7.0/security_advisories');
    expect(lastFetchCall(fetchMock)[1]?.method).toBe('POST');
    expect(requestBody(fetchMock)).toEqual({
      security_advisory: {
        name: 'Dirty Pipe',
        published_at: null,
        en_summary: 'Kernel vulnerability',
        cs_summary: 'Zranitelnost kernelu',
      },
    });

    await updateSecurityAdvisory(44, { name: 'Dirty Pipe updated', en_response: 'Reboot VPS' });
    expect(requestPath(fetchMock)).toBe('/v7.0/security_advisories/44');
    expect(lastFetchCall(fetchMock)[1]?.method).toBe('PUT');
    expect(requestBody(fetchMock)).toEqual({
      security_advisory: { name: 'Dirty Pipe updated', en_response: 'Reboot VPS' },
    });

    await publishSecurityAdvisory(44, { send_mail: true, published_at: '2026-07-27T10:00:00Z' });
    expect(requestPath(fetchMock)).toBe('/v7.0/security_advisories/44/publish');
    expect(lastFetchCall(fetchMock)[1]?.method).toBe('POST');
    expect(requestBody(fetchMock)).toEqual({
      security_advisory: { send_mail: true, published_at: '2026-07-27T10:00:00Z' },
    });

    await rebuildSecurityAdvisoryAffectedVps(44);
    expect(requestPath(fetchMock)).toBe('/v7.0/security_advisories/44/rebuild_affected_vps');
    expect(lastFetchCall(fetchMock)[1]?.method).toBe('POST');
  });

  test('CVE wrappers cover list, show, create, update and delete', async () => {
    const fetchMock = mockFetchOk({ security_advisory_cves: [] });
    vi.stubGlobal('fetch', fetchMock);

    await fetchSecurityAdvisoryCves({
      securityAdvisoryId: 44,
      cve: 'CVE-2026-12345',
      limit: 10,
      fromId: 20,
    });
    let parsed = new URL(String(lastFetchCall(fetchMock)[0]));
    expect(parsed.pathname).toBe('/v7.0/security_advisory_cves');
    expect(parsed.searchParams.get('security_advisory_cve[security_advisory]')).toBe('44');
    expect(parsed.searchParams.get('security_advisory_cve[cve]')).toBe('CVE-2026-12345');
    expect(parsed.searchParams.get('security_advisory_cve[limit]')).toBe('10');
    expect(parsed.searchParams.get('security_advisory_cve[from_id]')).toBe('20');

    await fetchSecurityAdvisoryCve(5);
    expect(requestPath(fetchMock)).toBe('/v7.0/security_advisory_cves/5');

    await createSecurityAdvisoryCve({ security_advisory: 44, cve_id: 'CVE-2026-12345' });
    expect(requestPath(fetchMock)).toBe('/v7.0/security_advisory_cves');
    expect(lastFetchCall(fetchMock)[1]?.method).toBe('POST');
    expect(requestBody(fetchMock)).toEqual({
      security_advisory_cve: { security_advisory: 44, cve_id: 'CVE-2026-12345' },
    });

    await updateSecurityAdvisoryCve(5, { cve_id: 'CVE-2026-54321' });
    expect(requestPath(fetchMock)).toBe('/v7.0/security_advisory_cves/5');
    expect(lastFetchCall(fetchMock)[1]?.method).toBe('PUT');
    expect(requestBody(fetchMock)).toEqual({ security_advisory_cve: { cve_id: 'CVE-2026-54321' } });

    await deleteSecurityAdvisoryCve(5);
    expect(requestPath(fetchMock)).toBe('/v7.0/security_advisory_cves/5');
    expect(lastFetchCall(fetchMock)[1]?.method).toBe('DELETE');
  });

  test('update wrappers cover list, show, create, update and delete', async () => {
    const fetchMock = mockFetchOk({ security_advisory_updates: [] });
    vi.stubGlobal('fetch', fetchMock);

    await fetchSecurityAdvisoryUpdates({
      securityAdvisoryId: 44,
      since: '2026-07-01T00:00:00Z',
      limit: 10,
      fromId: 20,
    });
    const parsed = new URL(String(lastFetchCall(fetchMock)[0]));
    expect(parsed.pathname).toBe('/v7.0/security_advisory_updates');
    expect(parsed.searchParams.get('security_advisory_update[security_advisory]')).toBe('44');
    expect(parsed.searchParams.get('security_advisory_update[since]')).toBe('2026-07-01T00:00:00Z');
    expect(parsed.searchParams.get('security_advisory_update[limit]')).toBe('10');
    expect(parsed.searchParams.get('security_advisory_update[from_id]')).toBe('20');

    await fetchSecurityAdvisoryUpdate(6);
    expect(requestPath(fetchMock)).toBe('/v7.0/security_advisory_updates/6');

    await createSecurityAdvisoryUpdate({
      security_advisory: 44,
      state: 'retracted',
      send_mail: true,
      en_summary: 'Advisory retracted',
      en_message: 'No longer applicable',
    });
    expect(requestPath(fetchMock)).toBe('/v7.0/security_advisory_updates');
    expect(lastFetchCall(fetchMock)[1]?.method).toBe('POST');
    expect(requestBody(fetchMock)).toEqual({
      security_advisory_update: {
        security_advisory: 44,
        state: 'retracted',
        send_mail: true,
        en_summary: 'Advisory retracted',
        en_message: 'No longer applicable',
      },
    });

    await updateSecurityAdvisoryUpdate(6, { en_summary: 'Updated summary', cs_message: 'Doplnění' });
    expect(requestPath(fetchMock)).toBe('/v7.0/security_advisory_updates/6');
    expect(lastFetchCall(fetchMock)[1]?.method).toBe('PUT');
    expect(requestBody(fetchMock)).toEqual({
      security_advisory_update: { en_summary: 'Updated summary', cs_message: 'Doplnění' },
    });

    await deleteSecurityAdvisoryUpdate(6);
    expect(requestPath(fetchMock)).toBe('/v7.0/security_advisory_updates/6');
    expect(lastFetchCall(fetchMock)[1]?.method).toBe('DELETE');
  });

  test('fetches every advisory update cursor page while preserving filters and includes', async () => {
    const pages = [
      [{ id: 5 }, { id: 4 }],
      [{ id: 4 }, { id: 3 }],
      [{ id: 2 }],
    ];
    const fetchMock = vi.fn(async (..._args: Parameters<typeof fetch>) => {
      const page = pages[fetchMock.mock.calls.length - 1] ?? [];
      return new Response(JSON.stringify({
        status: true,
        response: { security_advisory_updates: page },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchAllSecurityAdvisoryUpdates({
      securityAdvisoryId: 44,
      since: '2026-07-01T00:00:00Z',
      includes: 'reported_by',
      limit: 2,
      maxPages: 10,
    });

    expect(result.data.map((update) => update.id)).toEqual([5, 4, 3, 2]);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const requests = fetchMock.mock.calls.map(([url]) => new URL(String(url)));
    expect(requests.map((request) => request.searchParams.get('security_advisory_update[from_id]')))
      .toEqual([null, '4', '3']);
    for (const request of requests) {
      expect(request.searchParams.get('security_advisory_update[security_advisory]')).toBe('44');
      expect(request.searchParams.get('security_advisory_update[since]')).toBe('2026-07-01T00:00:00Z');
      expect(request.searchParams.get('security_advisory_update[limit]')).toBe('2');
      expect(request.searchParams.get('_meta[includes]')).toBe('reported_by');
    }
  });

  test('fails instead of truncating advisory updates when the API repeats a cursor', async () => {
    const fetchMock = mockFetchOk({ security_advisory_updates: [{ id: 9 }, { id: 8 }] });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchAllSecurityAdvisoryUpdates({ limit: 2, maxPages: 50 }))
      .rejects.toThrow('pagination stalled before the history was complete');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const requests = fetchMock.mock.calls.map(([url]) => new URL(String(url)));
    expect(requests[0]?.searchParams.get('security_advisory_update[from_id]')).toBeNull();
    expect(requests[1]?.searchParams.get('security_advisory_update[from_id]')).toBe('8');
  });

  test('fails instead of returning a silently truncated advisory update history', async () => {
    let nextId = 20;
    const fetchMock = vi.fn(async (..._args: Parameters<typeof fetch>) => {
      const page = [{ id: nextId }, { id: nextId - 1 }];
      nextId -= 2;
      return new Response(JSON.stringify({
        status: true,
        response: { security_advisory_updates: page },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchAllSecurityAdvisoryUpdates({ limit: 2, maxPages: 2 }))
      .rejects.toThrow('pagination exceeded its safety limit');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('nested node status wrappers use the nested node_status namespace', async () => {
    const fetchMock = mockFetchOk({ node_statuses: [] });
    vi.stubGlobal('fetch', fetchMock);

    await fetchSecurityAdvisoryNodeStatuses(44, { nodeId: 9, state: 'mitigated', limit: 10, fromId: 5 });
    const parsed = new URL(String(lastFetchCall(fetchMock)[0]));
    expect(parsed.pathname).toBe('/v7.0/security_advisories/44/node_statuses');
    expect(parsed.searchParams.get('node_status[node]')).toBe('9');
    expect(parsed.searchParams.get('node_status[state]')).toBe('mitigated');
    expect(parsed.searchParams.get('node_status[limit]')).toBe('10');
    expect(parsed.searchParams.get('node_status[from_id]')).toBe('5');

    await createSecurityAdvisoryNodeStatus(44, {
      node: 9,
      state: 'mitigated',
      vulnerable_until: '2026-07-27T08:00:00Z',
      mitigated_since: '2026-07-27T09:00:00Z',
      note: 'Kernel upgraded',
    });
    expect(requestPath(fetchMock)).toBe('/v7.0/security_advisories/44/node_statuses');
    expect(lastFetchCall(fetchMock)[1]?.method).toBe('POST');
    expect(requestBody(fetchMock)).toEqual({
      node_status: {
        node: 9,
        state: 'mitigated',
        vulnerable_until: '2026-07-27T08:00:00Z',
        mitigated_since: '2026-07-27T09:00:00Z',
        note: 'Kernel upgraded',
      },
    });

    await updateSecurityAdvisoryNodeStatus(44, 3, { state: 'not_affected', note: null });
    expect(requestPath(fetchMock)).toBe('/v7.0/security_advisories/44/node_statuses/3');
    expect(lastFetchCall(fetchMock)[1]?.method).toBe('PUT');
    expect(requestBody(fetchMock)).toEqual({ node_status: { state: 'not_affected', note: null } });

    await deleteSecurityAdvisoryNodeStatus(44, 3);
    expect(requestPath(fetchMock)).toBe('/v7.0/security_advisories/44/node_statuses/3');
    expect(lastFetchCall(fetchMock)[1]?.method).toBe('DELETE');
  });

  test('affected user and VPS lists forward all supported filters', async () => {
    const fetchMock = mockFetchOk({ user_security_advisories: [] });
    vi.stubGlobal('fetch', fetchMock);

    await fetchSecurityAdvisoryAffectedUsers({ securityAdvisoryId: 44, userId: 7, limit: 10, fromId: 2 });
    let parsed = new URL(String(lastFetchCall(fetchMock)[0]));
    expect(parsed.pathname).toBe('/v7.0/user_security_advisories');
    expect(parsed.searchParams.get('user_security_advisory[security_advisory]')).toBe('44');
    expect(parsed.searchParams.get('user_security_advisory[user]')).toBe('7');
    expect(parsed.searchParams.get('user_security_advisory[limit]')).toBe('10');
    expect(parsed.searchParams.get('user_security_advisory[from_id]')).toBe('2');

    await fetchSecurityAdvisoryAffectedVps({
      securityAdvisoryId: 44,
      vpsId: 8,
      userId: 7,
      environmentId: 1,
      locationId: 2,
      nodeId: 9,
      limit: 25,
      fromId: 3,
    });
    parsed = new URL(String(lastFetchCall(fetchMock)[0]));
    expect(parsed.pathname).toBe('/v7.0/vps_security_advisories');
    expect(parsed.searchParams.get('vps_security_advisory[security_advisory]')).toBe('44');
    expect(parsed.searchParams.get('vps_security_advisory[vps]')).toBe('8');
    expect(parsed.searchParams.get('vps_security_advisory[user]')).toBe('7');
    expect(parsed.searchParams.get('vps_security_advisory[environment]')).toBe('1');
    expect(parsed.searchParams.get('vps_security_advisory[location]')).toBe('2');
    expect(parsed.searchParams.get('vps_security_advisory[node]')).toBe('9');
    expect(parsed.searchParams.get('vps_security_advisory[limit]')).toBe('25');
    expect(parsed.searchParams.get('vps_security_advisory[from_id]')).toBe('3');
  });

  test('outage link wrappers cover list, show, create and delete', async () => {
    const fetchMock = mockFetchOk({ outage_security_advisories: [] });
    vi.stubGlobal('fetch', fetchMock);

    await fetchSecurityAdvisoryOutageLinks({ outageId: 12, securityAdvisoryId: 44, limit: 10, fromId: 5 });
    const parsed = new URL(String(lastFetchCall(fetchMock)[0]));
    expect(parsed.pathname).toBe('/v7.0/outage_security_advisories');
    expect(parsed.searchParams.get('outage_security_advisory[outage]')).toBe('12');
    expect(parsed.searchParams.get('outage_security_advisory[security_advisory]')).toBe('44');
    expect(parsed.searchParams.get('outage_security_advisory[limit]')).toBe('10');
    expect(parsed.searchParams.get('outage_security_advisory[from_id]')).toBe('5');

    await fetchSecurityAdvisoryOutageLink(4);
    expect(requestPath(fetchMock)).toBe('/v7.0/outage_security_advisories/4');

    await createSecurityAdvisoryOutageLink({ outage: 12, security_advisory: 44 });
    expect(requestPath(fetchMock)).toBe('/v7.0/outage_security_advisories');
    expect(lastFetchCall(fetchMock)[1]?.method).toBe('POST');
    expect(requestBody(fetchMock)).toEqual({
      outage_security_advisory: { outage: 12, security_advisory: 44 },
    });

    await deleteSecurityAdvisoryOutageLink(4);
    expect(requestPath(fetchMock)).toBe('/v7.0/outage_security_advisories/4');
    expect(lastFetchCall(fetchMock)[1]?.method).toBe('DELETE');
  });
});
