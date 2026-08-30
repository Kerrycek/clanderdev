import { describe, expect, test, vi } from 'vitest';

import { createVpsMount, deleteVpsMount, updateVpsMount } from './vpsMounts';

function mockFetchOk(response: unknown) {
  return vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: true, response }) });
}

describe('VPS mount blocking mutation contracts', () => {
  test.each([
    ['create', () => createVpsMount(12, { dataset: 3, mountpoint: '/mnt/data' })],
    ['update', () => updateVpsMount(12, 4, { enabled: false })],
    ['delete', () => deleteVpsMount(12, 4)],
  ])('fails closed when mount %s omits its action-state id', async (_action, call) => {
    globalThis.fetch = mockFetchOk({ mount: { id: 4 }, _meta: {} }) as unknown as typeof fetch;
    await expect(call()).rejects.toMatchObject({ code: 'MISSING_ACTION_STATE' });
  });
});
