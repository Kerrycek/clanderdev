import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createLocalLock,
  isLocalLockPersistenceError,
  LOCAL_LOCK_STORAGE_KEY,
} from '../../lib/localLocks';
import { objectRef } from '../../lib/objectRef';
import { useLocalMutationLocks } from './useLocalMutationLocks';
import { installSerialWebLocks } from './webLocksTestMock';

function renderLocks(userId = 42) {
  return renderHook(() => useLocalMutationLocks({
    userId,
    persistenceErrorMessage: 'guard persistence failed',
    outcomeUncertainMessage: 'outcome uncertain',
  }));
}

function uncertaintyEntryKey(userId: number, objectKey: string, uncertaintyId: string): string {
  return `${LOCAL_LOCK_STORAGE_KEY}.user-${userId}.uncertain.${encodeURIComponent(objectKey)}.${encodeURIComponent(uncertaintyId)}`;
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

describe('useLocalMutationLocks uncertainty storage integrity', () => {
  it('discards the unattributable legacy session array instead of importing it into the user scope', async () => {
    const ref = objectRef('Vps', 9992);
    window.sessionStorage.setItem(
      LOCAL_LOCK_STORAGE_KEY,
      JSON.stringify([createLocalLock(ref, Date.now(), { actionStateId: 9992 })])
    );

    const hook = renderLocks();

    await act(async () => undefined);
    expect(hook.result.current.localLocks).toEqual([]);
    expect(window.sessionStorage.getItem(LOCAL_LOCK_STORAGE_KEY)).toBeNull();
    expect(Object.keys(window.localStorage).filter((key) => key.includes('Vps%3A9992'))).toEqual([]);
    expect(hook.result.current.isLocallyLocked(ref)).toBe(false);
    hook.unmount();
  });

  it('hydrates an ordinary lock stored in an uncertainty slot as a pending corrupt guard', async () => {
    const ref = objectRef('Vps', 123);
    const ordinary = createLocalLock(ref, Date.now());
    window.localStorage.setItem(
      uncertaintyEntryKey(42, ordinary.key, 'ordinary-in-guard-slot'),
      JSON.stringify(ordinary)
    );

    const hook = renderLocks();
    expect(hook.result.current.localLocks[0]).toMatchObject({
      key: 'Vps:123',
      pending: true,
      uncertain: undefined,
    });
    expect(hook.result.current.localLocks[0]?.uncertaintyId).toMatch(/^corrupt-/);
    await expect(hook.result.current.acquireLocalLock(ref, { durable: true }))
      .rejects.toSatisfy(isLocalLockPersistenceError);
    expect(hook.result.current.localLocks[0]).toMatchObject({ key: 'Vps:123', pending: true });
    hook.unmount();
  });

  it.each([
    {
      name: 'value object',
      valueRef: objectRef('Vps', 124),
      valueGeneration: 'slot-generation',
    },
    {
      name: 'generation',
      valueRef: objectRef('Vps', 123),
      valueGeneration: 'different-generation',
    },
  ])('readLatestGuard fails closed when a guarded marker has a mismatched $name', async ({
    valueRef,
    valueGeneration,
  }) => {
    const slotRef = objectRef('Vps', 123);
    const marker = createLocalLock(valueRef, Date.now(), {
      pending: true,
      uncertaintyId: valueGeneration,
    });
    const hook = renderLocks();
    expect(hook.result.current.isLocallyLocked(slotRef)).toBe(false);
    window.localStorage.setItem(
      uncertaintyEntryKey(42, 'Vps:123', 'slot-generation'),
      JSON.stringify(marker)
    );

    let acquireError: unknown;
    await act(async () => {
      try {
        await hook.result.current.acquireLocalLock(slotRef, { durable: true });
      } catch (error) {
        acquireError = error;
      }
    });

    expect(acquireError).toSatisfy(isLocalLockPersistenceError);
    expect(hook.result.current.localLocks[0]).toMatchObject({
      key: 'Vps:123',
      pending: true,
      uncertain: undefined,
    });
    expect(hook.result.current.localLocks[0]?.uncertaintyId).toMatch(/^corrupt-/);
    hook.unmount();
  });
});
