import { describe, expect, it, vi } from 'vitest';

import { setEnvironmentMaintenance, setLocationMaintenance } from './infra';

function mockFetchOk() {
  return vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: true, response: null }) });
}

describe('infrastructure maintenance API', () => {
  it.each([
    ['environment', () => setEnvironmentMaintenance(4, { lock: true, reason: 'network work' }), '/v7.0/environments/4/set_maintenance'],
    ['location', () => setLocationMaintenance(7, { lock: false }), '/v7.0/locations/7/set_maintenance'],
  ])('posts the %s maintenance action', async (_name, call, path) => {
    globalThis.fetch = mockFetchOk() as typeof fetch;
    await call();
    const [url, init] = vi.mocked(globalThis.fetch).mock.calls.at(-1) as [string, RequestInit];
    expect(new URL(url).pathname).toBe(path);
    expect(init.method).toBe('POST');
  });
});
