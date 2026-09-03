import { describe, expect, test, vi } from 'vitest';

import { deployVpsUserData } from './vpsUserData';

function mockFetchOk(response: unknown) {
  return vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: true, response }) });
}

describe('VPS user-data blocking mutation contract', () => {
  test('fails closed when deploy omits its action-state id', async () => {
    globalThis.fetch = mockFetchOk({ _meta: {} }) as unknown as typeof fetch;

    await expect(deployVpsUserData(17, 42)).rejects.toMatchObject({ code: 'MISSING_ACTION_STATE' });
  });

  test('accepts deploy only with a valid action-state id', async () => {
    globalThis.fetch = mockFetchOk({ _meta: { action_state_id: 731 } }) as unknown as typeof fetch;

    await expect(deployVpsUserData(17, 42)).resolves.toEqual({ meta: { action_state_id: 731 } });
  });
});
