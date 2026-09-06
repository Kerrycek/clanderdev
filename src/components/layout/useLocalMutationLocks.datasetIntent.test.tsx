import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MissingActionStateError } from '../../lib/api/haveapi';
import type { LocalMutationGeneration } from '../../lib/localLocks';
import { objectRef } from '../../lib/objectRef';
import { useLocalMutationLocks } from './useLocalMutationLocks';
import { installSerialWebLocks } from './webLocksTestMock';

function renderLocks() {
  return renderHook(() => useLocalMutationLocks({
    userId: 42,
    persistenceErrorMessage: 'guard persistence failed',
    outcomeUncertainMessage: 'outcome uncertain',
  }));
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  installSerialWebLocks();
});

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'locks');
});

describe('useLocalMutationLocks dataset rollback intent', () => {
  it('persists a validated dataset rollback intent across an ambiguous reload', async () => {
    const hook = renderLocks();
    const ref = objectRef('Dataset', 10402);
    const intent = {
      type: 'dataset-snapshot-rollback' as const,
      snapshotId: 91,
      baselineTransactionChainId: 812,
    };
    let generation!: LocalMutationGeneration;

    await act(async () => {
      generation = await hook.result.current.acquireLocalLock(ref, { durable: true, intent });
    });
    act(() => hook.result.current.settleLocalLock(
      ref,
      new MissingActionStateError('dataset snapshot rollback'),
      generation
    ));
    expect(hook.result.current.localLocks[0]).toMatchObject({ uncertain: true, intent });
    hook.unmount();

    const remounted = renderLocks();
    expect(remounted.result.current.localLocks[0]).toMatchObject({
      key: 'Dataset:10402',
      uncertain: true,
      intent,
    });
    remounted.unmount();
  });
});
