import { describe, expect, test, vi } from 'vitest';

import {
  fetchChangeRequests,
  fetchRegistrationRequests,
  previewRegistrationRequest,
  resolveChangeRequest,
  resolveRegistrationRequest,
  updateRegistrationRequestByToken,
} from './requests';

function mockFetchOk(response: any) {
  return vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: true, response }) });
}

function lastFetchCall() {
  const calls = (globalThis.fetch as any).mock.calls;
  return calls[calls.length - 1] as [string, RequestInit?];
}

describe('requests API wrappers', () => {
  test('fetchRegistrationRequests forwards q and structured filters', async () => {
    globalThis.fetch = mockFetchOk({ registrations: [], _meta: { total_count: 0 } }) as any;

    await fetchRegistrationRequests({
      limit: 25,
      fromId: 77,
      state: 'awaiting',
      q: 'alice',
      userId: 7,
      adminId: 2,
      apiIpAddr: '192.0.2.10',
      clientIpAddr: '198.51.100.5',
      clientIpPtr: 'ptr.example.test',
      count: true,
    });

    const [url] = lastFetchCall();
    const u = new URL(url);

    expect(u.pathname).toBe('/v7.0/user_request/registrations');
    expect(u.searchParams.get('registration[limit]')).toBe('25');
    expect(u.searchParams.get('registration[from_id]')).toBe('77');
    expect(u.searchParams.get('registration[state]')).toBe('awaiting');
    expect(u.searchParams.get('registration[q]')).toBe('alice');
    expect(u.searchParams.get('registration[user]')).toBe('7');
    expect(u.searchParams.get('registration[admin]')).toBe('2');
    expect(u.searchParams.get('registration[api_ip_addr]')).toBe('192.0.2.10');
    expect(u.searchParams.get('registration[client_ip_addr]')).toBe('198.51.100.5');
    expect(u.searchParams.get('registration[client_ip_ptr]')).toBe('ptr.example.test');
    expect(u.searchParams.get('_meta[count]')).toBe('true');
  });

  test('fetchChangeRequests forwards q and structured filters', async () => {
    globalThis.fetch = mockFetchOk({ changes: [], _meta: { total_count: 0 } }) as any;

    await fetchChangeRequests({
      limit: 15,
      fromId: 88,
      state: 'approved',
      q: 'rename',
      userId: 9,
      adminId: 3,
      apiIpAddr: '192.0.2.20',
      clientIpAddr: '198.51.100.8',
      clientIpPtr: 'ptr2.example.test',
      count: true,
    });

    const [url] = lastFetchCall();
    const u = new URL(url);

    expect(u.pathname).toBe('/v7.0/user_request/changes');
    expect(u.searchParams.get('change[limit]')).toBe('15');
    expect(u.searchParams.get('change[from_id]')).toBe('88');
    expect(u.searchParams.get('change[state]')).toBe('approved');
    expect(u.searchParams.get('change[q]')).toBe('rename');
    expect(u.searchParams.get('change[user]')).toBe('9');
    expect(u.searchParams.get('change[admin]')).toBe('3');
    expect(u.searchParams.get('change[api_ip_addr]')).toBe('192.0.2.20');
    expect(u.searchParams.get('change[client_ip_addr]')).toBe('198.51.100.8');
    expect(u.searchParams.get('change[client_ip_ptr]')).toBe('ptr2.example.test');
    expect(u.searchParams.get('_meta[count]')).toBe('true');
  });

  test('previewRegistrationRequest encodes the token in the path', async () => {
    globalThis.fetch = mockFetchOk({ registration: { id: 11 } }) as any;

    await previewRegistrationRequest(11, 'fix token/42');

    const [url] = lastFetchCall();
    const u = new URL(url);

    expect(u.pathname).toBe('/v7.0/user_request/registrations/11/fix%20token%2F42');
  });

  test('updateRegistrationRequestByToken sends namespaced payload', async () => {
    globalThis.fetch = mockFetchOk({ registration: { id: 11 } }) as any;

    await updateRegistrationRequestByToken(11, 'fix-token', {
      login: 'alice',
      full_name: 'Alice Example',
      email: 'alice@example.test',
      address: 'Spec Street 1',
      year_of_birth: 1990,
      os_template: 5,
      location: 9,
      currency: 'eur',
      language: 1,
    });

    const [url, init] = lastFetchCall();
    const u = new URL(url);
    const body = JSON.parse(String((init as RequestInit).body));

    expect(u.pathname).toBe('/v7.0/user_request/registrations/11/fix-token');
    expect((init as RequestInit).method).toBe('PUT');
    expect(body).toEqual({
      registration: {
        login: 'alice',
        full_name: 'Alice Example',
        email: 'alice@example.test',
        address: 'Spec Street 1',
        year_of_birth: 1990,
        os_template: 5,
        location: 9,
        currency: 'eur',
        language: 1,
      },
    });
  });

  test('resolveRegistrationRequest posts namespaced action payload', async () => {
    globalThis.fetch = mockFetchOk({ registration: { id: 12 }, _meta: { action_state_id: 44 } }) as any;

    await resolveRegistrationRequest(12, {
      action: 'approve',
      reason: 'Looks fine',
      activate: true,
      create_vps: false,
      node: 7,
    });

    const [url, init] = lastFetchCall();
    const u = new URL(url);
    const body = JSON.parse(String((init as RequestInit).body));

    expect(u.pathname).toBe('/v7.0/user_request/registrations/12/resolve');
    expect((init as RequestInit).method).toBe('POST');
    expect(body).toEqual({
      registration: {
        action: 'approve',
        reason: 'Looks fine',
        activate: true,
        create_vps: false,
        node: 7,
      },
    });
  });

  test('resolveChangeRequest posts namespaced action payload', async () => {
    globalThis.fetch = mockFetchOk({ change: { id: 13 } }) as any;

    await resolveChangeRequest(13, {
      action: 'request_correction',
      reason: 'Missing address',
      address: 'New address',
    });

    const [url, init] = lastFetchCall();
    const u = new URL(url);
    const body = JSON.parse(String((init as RequestInit).body));

    expect(u.pathname).toBe('/v7.0/user_request/changes/13/resolve');
    expect((init as RequestInit).method).toBe('POST');
    expect(body).toEqual({
      change: {
        action: 'request_correction',
        reason: 'Missing address',
        address: 'New address',
      },
    });
  });
});
