import { describe, expect, test, vi } from 'vitest';

import { updateVpsFeature, updateVpsFeaturesAll } from './vpsFeatures';

function mockFetchOk(response: unknown) {
  return vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: true, response }) });
}

describe('VPS feature blocking mutation contracts', () => {
  test.each([
    ['single update', () => updateVpsFeature(12, 3, true)],
    ['update all', () => updateVpsFeaturesAll(12, { quota: true })],
  ])('fails closed when %s omits its action-state id', async (_action, call) => {
    globalThis.fetch = mockFetchOk({ _meta: {} }) as unknown as typeof fetch;
    await expect(call()).rejects.toMatchObject({ code: 'MISSING_ACTION_STATE' });
  });
});
