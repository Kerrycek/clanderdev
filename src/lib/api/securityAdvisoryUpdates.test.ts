import { describe, expect, it, vi } from 'vitest';

import { deleteSecurityAdvisoryUpdate, updateSecurityAdvisoryUpdate } from './securityAdvisoryUpdates';

function mockFetchOk(response: unknown) {
  return vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: true, response }) });
}

describe('security advisory update mutations', () => {
  it('updates localized text and deletes the selected update without a parent mutation', async () => {
    globalThis.fetch = mockFetchOk({ security_advisory_update: { id: 8 } }) as typeof fetch;
    await updateSecurityAdvisoryUpdate(8, { en_summary: 'Updated', en_message: null });
    let [url, init] = vi.mocked(globalThis.fetch).mock.calls.at(-1) as [string, RequestInit];
    expect(new URL(url).pathname).toBe('/v7.0/security_advisory_updates/8');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body))).toEqual({ security_advisory_update: { en_summary: 'Updated', en_message: null } });

    globalThis.fetch = mockFetchOk(null) as typeof fetch;
    await deleteSecurityAdvisoryUpdate(8);
    [url, init] = vi.mocked(globalThis.fetch).mock.calls.at(-1) as [string, RequestInit];
    expect(new URL(url).pathname).toBe('/v7.0/security_advisory_updates/8');
    expect(init.method).toBe('DELETE');
  });
});
