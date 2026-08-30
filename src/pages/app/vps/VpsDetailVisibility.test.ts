import { describe, expect, it } from 'vitest';

import type { TrackedActionState } from '../../../components/layout/ChromeContext';
import {
  pendingVpsCreateNavigationState,
  resolvePendingVpsCreateActionStateId,
  shouldDeferVpsDetailQuery,
} from './VpsDetailVisibility';

function tracked(overrides: Partial<TrackedActionState> = {}): TrackedActionState {
  return {
    id: 41,
    addedAt: 100,
    actionLabelKey: 'action.vps.create.label',
    object: { kind: 'Vps', id: 31 },
    ...overrides,
  };
}

describe('VPS post-create detail visibility', () => {
  it('prefers the exact navigation receipt and otherwise finds the newest matching create action', () => {
    expect(resolvePendingVpsCreateActionStateId(
      pendingVpsCreateNavigationState(31, 99),
      [tracked()],
      31,
    )).toBe(99);

    expect(resolvePendingVpsCreateActionStateId(undefined, [
      tracked({ id: 42, addedAt: 200 }),
      tracked({ id: 43, addedAt: 300, object: { kind: 'Vps', id: 32 } }),
      tracked({ id: 44, addedAt: 400, actionLabelKey: 'action.vps.start.label' }),
      tracked({ id: 45, addedAt: 500 }),
    ], 31)).toBe(45);
  });

  it('ignores malformed, foreign and non-create receipts', () => {
    expect(resolvePendingVpsCreateActionStateId(
      { pendingVpsCreate: { vpsId: 32, actionStateId: 99 } },
      [tracked({ object: { kind: 'Vps', id: 30 } })],
      31,
    )).toBeUndefined();
    expect(resolvePendingVpsCreateActionStateId(
      { pendingVpsCreate: { vpsId: 31, actionStateId: -1 } },
      [],
      31,
    )).toBeUndefined();
  });

  it('defers only while the accepted create action is unresolved', () => {
    expect(shouldDeferVpsDetailQuery(41, undefined, false)).toBe(true);
    expect(shouldDeferVpsDetailQuery(41, { id: 41, finished: false }, false)).toBe(true);
    expect(shouldDeferVpsDetailQuery(41, { id: 41, finished: true, status: true }, false)).toBe(false);
    expect(shouldDeferVpsDetailQuery(41, undefined, true)).toBe(false);
    expect(shouldDeferVpsDetailQuery(undefined, undefined, false)).toBe(false);
  });
});
