import { describe, expect, test, vi } from 'vitest';

import {
  createVps,
  updateVps,
  vpsBoot,
  vpsClone,
  vpsDelete,
  vpsMigrate,
  vpsPasswd,
  vpsReinstall,
  vpsReplace,
  vpsRestart,
  vpsStart,
  vpsStop,
  vpsSwapWith,
} from './vps';

function mockFetchOk(response: unknown) {
  return vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: true, response }) });
}

describe('blocking VPS API contracts', () => {
  test('accepts a synchronous VPS lifetime-date update without an action-state id', async () => {
    globalThis.fetch = mockFetchOk({ vps: { id: 12, remind_after_date: null }, _meta: {} }) as unknown as typeof fetch;
    await expect(updateVps(12, { remind_after_date: null })).resolves.toMatchObject({
      data: { id: 12, remind_after_date: null },
    });
  });

  test.each([
    ['start', () => vpsStart(12)],
    ['stop', () => vpsStop(12)],
    ['restart', () => vpsRestart(12)],
    ['password reset', () => vpsPasswd(12)],
  ])('fails closed when VPS %s omits its action-state id', async (_action, call) => {
    globalThis.fetch = mockFetchOk({ _meta: {} }) as unknown as typeof fetch;
    await expect(call()).rejects.toMatchObject({ code: 'MISSING_ACTION_STATE' });
  });

  test.each([
    [
      'create',
      () => createVps({
        mode: 'user',
        hostname: 'missing-task.example',
        location: 2,
        os_template: 6,
      }),
    ],
    ['update', () => updateVps(12, { cpu: 4 })],
    ['clone', () => vpsClone(12, {})],
    ['swap', () => vpsSwapWith(12, { vps: 13 })],
    ['replace', () => vpsReplace(12, {})],
    ['boot', () => vpsBoot(12, {})],
    ['reinstall', () => vpsReinstall(12, {})],
    ['migrate', () => vpsMigrate(12, { node: 2 })],
    ['delete', () => vpsDelete(12)],
  ])('fails closed when VPS %s omits its action-state id', async (_action, call) => {
    globalThis.fetch = mockFetchOk({ vps: { id: 12 }, _meta: {} }) as unknown as typeof fetch;
    await expect(call()).rejects.toMatchObject({ code: 'MISSING_ACTION_STATE' });
  });
});
