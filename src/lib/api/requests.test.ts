import { describe, expect, test, vi } from 'vitest';

import {
  assertOwnedUserRequest,
  assertOwnedUserRequests,
  fetchChangeRequests,
  fetchMyChangeRequest,
  fetchMyChangeRequests,
  fetchMyRegistrationRequests,
  fetchRegistrationRequests,
  previewRegistrationRequest,
  resolveChangeRequest,
  resolveRegistrationRequest,
  updateRegistrationRequestByToken,
  type UserRequestCommon,
  UserRequestOwnershipError,
} from './requests';

function mockFetchOk(response: Record<string, unknown>): typeof fetch {
  const result: Pick<Response, 'ok' | 'status' | 'json'> = {
    ok: true,
    status: 200,
    json: async () => ({ status: true, response }),
  };

  return vi.fn<typeof fetch>().mockResolvedValue(
    result as Response
  );
}

function lastFetchCall() {
  const call = vi.mocked(globalThis.fetch).mock.calls.at(-1);
  if (!call) throw new Error('Expected fetch to have been called');

  const input = call[0];
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  return [url, call[1]] as const;
}

describe('requests API wrappers', () => {
  test('owner verification accepts numeric string IDs and rejects missing or foreign owners', () => {
    const owned: UserRequestCommon = { id: 1, user: { id: '7' } };
    expect(assertOwnedUserRequest(owned, 7)).toBe(owned);

    expect(() => assertOwnedUserRequest({ id: 2 }, 7)).toThrow(UserRequestOwnershipError);
    expect(() => assertOwnedUserRequest({ id: 3, user: { id: 8 } }, 7)).toThrow(
      UserRequestOwnershipError
    );
    expect(() => assertOwnedUserRequests([
      { id: 4, user: { id: 7 } },
      { id: 5, user: { id: 8 } },
    ], 7)).toThrow(UserRequestOwnershipError);
  });

  test('fetchMyChangeRequests sends only owner-safe index parameters', async () => {
    globalThis.fetch = mockFetchOk({
      changes: [{ id: 9, user: { id: '7' }, state: 'awaiting' }],
    });

    const result = await fetchMyChangeRequests(7, {
      limit: 25,
      fromId: 77,
      state: 'awaiting',
      count: true,
    });

    expect(result.data.map((request) => request.id)).toEqual([9]);
    const [url] = lastFetchCall();
    const u = new URL(url);
    expect(u.searchParams.get('change[limit]')).toBe('25');
    expect(u.searchParams.get('change[from_id]')).toBe('77');
    expect(u.searchParams.get('change[state]')).toBe('awaiting');
    expect(u.searchParams.get('_meta[count]')).toBe('true');
    expect(u.searchParams.has('change[user]')).toBe(false);
    expect(u.searchParams.has('change[q]')).toBe(false);
    expect(u.searchParams.has('change[admin]')).toBe(false);
    expect(u.searchParams.has('change[api_ip_addr]')).toBe(false);
    expect(u.searchParams.has('change[client_ip_addr]')).toBe(false);
  });

  test('fetchMyChangeRequests explicitly owner-filters a privileged self view', async () => {
    globalThis.fetch = mockFetchOk({ changes: [] });

    await fetchMyChangeRequests(7, {
      limit: 25,
      count: true,
      explicitOwnerFilter: true,
    });

    const [url] = lastFetchCall();
    const u = new URL(url);
    expect(u.searchParams.get('change[user]')).toBe('7');
  });

  test('fetchMyRegistrationRequests explicitly owner-filters a privileged self view', async () => {
    globalThis.fetch = mockFetchOk({ registrations: [] });

    await fetchMyRegistrationRequests(7, {
      limit: 25,
      count: true,
      explicitOwnerFilter: true,
    });

    const [url] = lastFetchCall();
    const u = new URL(url);
    expect(u.searchParams.get('registration[user]')).toBe('7');
  });

  test('owner-safe list and detail wrappers fail closed on foreign data', async () => {
    globalThis.fetch = mockFetchOk({
      registrations: [{ id: 11, user: { id: 99 }, email: 'private@example.test' }],
    });
    await expect(fetchMyRegistrationRequests(7, { limit: 25 })).rejects.toBeInstanceOf(
      UserRequestOwnershipError
    );

    globalThis.fetch = mockFetchOk({
      change: { id: 12, user: { id: 99 }, address: 'Private address' },
    });
    await expect(fetchMyChangeRequest(12, 7)).rejects.toBeInstanceOf(
      UserRequestOwnershipError
    );
  });

  test('fetchRegistrationRequests forwards q and structured filters', async () => {
    globalThis.fetch = mockFetchOk({ registrations: [], _meta: { total_count: 0 } });

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
    globalThis.fetch = mockFetchOk({ changes: [], _meta: { total_count: 0 } });

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
    globalThis.fetch = mockFetchOk({ registration: { id: 11 } });

    await previewRegistrationRequest(11, 'fix token/42');

    const [url] = lastFetchCall();
    const u = new URL(url);

    expect(u.pathname).toBe('/v7.0/user_request/registrations/11/fix%20token%2F42');
  });

  test('updateRegistrationRequestByToken sends namespaced payload', async () => {
    globalThis.fetch = mockFetchOk({ registration: { id: 11 } });

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
    globalThis.fetch = mockFetchOk({ registration: { id: 12 }, _meta: { action_state_id: 44 } });

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
    globalThis.fetch = mockFetchOk({ change: { id: 13 } });

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
