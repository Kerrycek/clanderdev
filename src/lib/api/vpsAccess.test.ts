import { afterEach, describe, expect, it, vi } from 'vitest';

import { deployVpsPublicKey, getCurrentUser, listUserPublicKeys, resetVpsRootPassword } from './vpsAccess';

function makeOkResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function setMockRuntime() {
  window.vpsAdmin = {
    api: { url: 'https://api.example.test', version: 'v7.0' },
    sessionToken: 'tok_123',
    description: {
      meta: { namespace: '_meta' },
      authentication: { token: { http_header: 'X-Auth-Token' } },
    },
  };
}

function installOkFetch(response: unknown) {
  const fetchMock = vi.fn(async (..._args: Parameters<typeof fetch>) =>
    makeOkResponse({ status: true, response })
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function getFetchCall(fetchMock: ReturnType<typeof installOkFetch>, index = 0): Parameters<typeof fetch> {
  return fetchMock.mock.calls[index]! as Parameters<typeof fetch>;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.vpsAdmin = undefined;
});

describe('vps access API wrappers', () => {
  it('resets the root password through the vps passwd action', async () => {
    setMockRuntime();
    const fetchMock = installOkFetch({
      _meta: { action_state: 42 },
      vps: { password: 'secret' },
    });

    await resetVpsRootPassword(13, { type: 'simple' });

    const [url, init] = getFetchCall(fetchMock);
    expect(String(url)).toContain('/v7.0/vpses/13/passwd');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ vps: { type: 'simple' } });
  });

  it('deploys a saved public key through the vps deploy_public_key action', async () => {
    setMockRuntime();
    const fetchMock = installOkFetch({ _meta: { action_state: 43 } });

    await deployVpsPublicKey(13, 7);

    const [url, init] = getFetchCall(fetchMock);
    expect(String(url)).toContain('/v7.0/vpses/13/deploy_public_key');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ vps: { public_key: 7 } });
  });

  it('fails closed and does not return a password when passwd omits its action-state id', async () => {
    setMockRuntime();
    installOkFetch({ _meta: {}, vps: { password: 'must-not-be-returned' } });

    await expect(resetVpsRootPassword(13)).rejects.toMatchObject({
      code: 'MISSING_ACTION_STATE',
      action: 'VPS password reset',
    });
  });

  it('fails closed when deploy_public_key omits its action-state id', async () => {
    setMockRuntime();
    installOkFetch({ _meta: {}, vps: {} });

    await expect(deployVpsPublicKey(13, 7)).rejects.toMatchObject({
      code: 'MISSING_ACTION_STATE',
      action: 'VPS public-key deployment',
    });
  });

  it('loads saved public keys for the VPS owner via the user dossier endpoint', async () => {
    setMockRuntime();
    const fetchMock = installOkFetch({
      _meta: { total_count: 1 },
      public_keys: [{ id: 7, label: 'laptop' }],
    });

    const res = await listUserPublicKeys(99);

    const [url] = getFetchCall(fetchMock);
    expect(String(url)).toContain('/v7.0/users/99/public_keys?');
    expect(String(url)).toContain('public_key%5Blimit%5D=100');
    expect(res.data).toEqual([{ id: 7, label: 'laptop' }]);
  });

  it('loads the current user for owner fallback', async () => {
    setMockRuntime();
    const fetchMock = installOkFetch({ user: { id: 99, login: 'kerry', level: 99 } });

    const res = await getCurrentUser();

    const [url, init] = getFetchCall(fetchMock);
    expect(String(url)).toContain('/v7.0/users/current');
    expect(init?.method).toBe('GET');
    expect(res.data.id).toBe(99);
  });
});
