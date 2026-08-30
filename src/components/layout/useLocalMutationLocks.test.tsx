import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MissingActionStateError } from '../../lib/api/haveapi';
import {
  createLocalLock,
  isLocalLockPersistenceError,
  LOCAL_LOCK_STORAGE_KEY,
  type LocalMutationGeneration,
} from '../../lib/localLocks';
import { objectRef } from '../../lib/objectRef';
import { useLocalMutationLocks } from './useLocalMutationLocks';
import { installSerialWebLocks } from './webLocksTestMock';
import { LEASE_GENERATION_PREFIX } from './localMutationLockStorage';

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

function ordinaryEntryKey(userId: number, objectKey: string): string {
  return `${LOCAL_LOCK_STORAGE_KEY}.user-${userId}.entry.${encodeURIComponent(objectKey)}`;
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

describe('useLocalMutationLocks durable uncertainty', () => {
  it('serializes two tabs so only one same-object mutation can start', async () => {
    const first = renderLocks();
    const second = renderLocks();
    const ref = objectRef('Vps', 123);
    let mutationStarts = 0;

    const start = async (hook: typeof first) => {
      await hook.result.current.acquireLocalLock(ref, { durable: true });
      mutationStarts += 1;
    };
    const results = await Promise.allSettled([start(first), start(second)]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(mutationStarts).toBe(1);
    first.unmount();
    second.unmount();
  });

  it('does not settle the first generation when a second same-object acquire is rejected', async () => {
    const hook = renderLocks();
    const ref = objectRef('Vps', 123);
    let firstGeneration!: LocalMutationGeneration;

    await act(async () => {
      firstGeneration = await hook.result.current.acquireLocalLock(ref, { durable: true });
    });
    const first = hook.result.current.localLocks[0]!;
    let secondAcquireError: unknown;
    await act(async () => {
      try {
        await hook.result.current.acquireLocalLock(ref, { durable: true });
      } catch (error) {
        secondAcquireError = error;
      }
    });
    expect(secondAcquireError).toSatisfy(isLocalLockPersistenceError);

    act(() => hook.result.current.settleLocalLock(ref, secondAcquireError));
    expect(hook.result.current.localLocks[0]).toMatchObject({
      key: 'Vps:123',
      pending: true,
      uncertaintyId: first.uncertaintyId,
    });
    expect(window.localStorage.getItem(
      uncertaintyEntryKey(42, first.key, first.uncertaintyId!)
    )).not.toBeNull();

    act(() => hook.result.current.settleLocalLock(ref, new MissingActionStateError('VPS start'), firstGeneration));
    expect(hook.result.current.localLocks[0]).toMatchObject({
      key: 'Vps:123',
      uncertain: true,
      uncertaintyId: first.uncertaintyId,
    });
    hook.unmount();
  });

  it('keeps ambiguous outcomes across release, remount and an exact acknowledgement', async () => {
    const hook = renderLocks();
    const ref = objectRef('Vps', 123);
    let generation!: LocalMutationGeneration;
    await act(async () => {
      generation = await hook.result.current.acquireLocalLock(ref, { durable: true });
    });
    act(() => hook.result.current.settleLocalLock(ref, new MissingActionStateError('VPS start'), generation));
    const uncertaintyId = hook.result.current.localLocks[0]?.uncertaintyId;
    expect(uncertaintyId).toBeTruthy();

    act(() => hook.result.current.releaseLocalLock(ref));
    expect(hook.result.current.isLocallyLocked(ref)).toBe(true);
    hook.unmount();

    const remounted = renderLocks();
    expect(remounted.result.current.isLocallyLocked(ref)).toBe(true);
    act(() => remounted.result.current.acknowledgeUncertainLocalLock(ref, uncertaintyId));
    expect(remounted.result.current.isLocallyLocked(ref)).toBe(false);
    remounted.unmount();
  });

  it('keeps the durable preflight phase non-acknowledgeable until the request settles ambiguously', async () => {
    const hook = renderLocks();
    const ref = objectRef('Vps', 123);
    let generation!: LocalMutationGeneration;

    await act(async () => {
      generation = await hook.result.current.acquireLocalLock(ref, { durable: true });
    });
    const pending = hook.result.current.localLocks[0]!;
    expect(pending).toMatchObject({ key: 'Vps:123', pending: true });

    act(() => hook.result.current.releaseLocalLock(ref));
    act(() => hook.result.current.acknowledgeUncertainLocalLock(ref, pending.uncertaintyId));
    expect(hook.result.current.localLocks[0]).toMatchObject({ pending: true });

    act(() => hook.result.current.settleLocalLock(ref, new MissingActionStateError('VPS start'), generation));
    expect(hook.result.current.localLocks[0]).toMatchObject({
      key: 'Vps:123',
      uncertain: true,
      uncertaintyId: pending.uncertaintyId,
    });
    hook.unmount();
  });

  it('does not let an exact acknowledgement erase a newer uncertainty generation', async () => {
    const hook = renderLocks();
    const ref = objectRef('Vps', 123);
    let generation!: LocalMutationGeneration;

    await act(async () => {
      generation = await hook.result.current.acquireLocalLock(ref, { durable: true });
    });
    act(() => hook.result.current.settleLocalLock(ref, new MissingActionStateError('VPS start'), generation));
    const first = hook.result.current.localLocks[0]!;
    const second = createLocalLock(ref, first.acquiredAt + 1, {
      uncertain: true,
      uncertaintyId: 'newer-generation',
    });
    window.localStorage.setItem(
      uncertaintyEntryKey(42, second.key, second.uncertaintyId!),
      JSON.stringify(second)
    );

    act(() => hook.result.current.acknowledgeUncertainLocalLock(ref, first.uncertaintyId));
    expect(hook.result.current.localLocks[0]).toMatchObject({
      key: 'Vps:123',
      uncertain: true,
      uncertaintyId: 'newer-generation',
    });
    expect(hook.result.current.isLocallyLocked(ref)).toBe(true);
    hook.unmount();
  });

  it('keeps action-state-bound locks persisted through ordinary settle/release', async () => {
    const hook = renderLocks();
    const ref = objectRef('Vps', 123);
    let generation!: LocalMutationGeneration;

    await act(async () => {
      generation = await hook.result.current.acquireLocalLock(ref, { durable: true });
      hook.result.current.acquireLocalLock(ref, { actionStateId: 901, generation });
    });
    act(() => hook.result.current.settleLocalLock(ref, null, generation));
    act(() => hook.result.current.releaseLocalLock(ref));
    expect(hook.result.current.localLocks[0]).toMatchObject({ actionStateId: 901 });

    hook.unmount();
    const remounted = renderLocks();
    expect(remounted.result.current.localLocks[0]).toMatchObject({ actionStateId: 901 });
    act(() => remounted.result.current.releaseLocalLocksByActionStateId(901));
    expect(remounted.result.current.isLocallyLocked(ref)).toBe(false);
    remounted.unmount();
  });

  it('a late settle from released generation A cannot consume pending generation B', async () => {
    const hook = renderLocks();
    const ref = objectRef('Vps', 123);
    let generationA!: LocalMutationGeneration;
    let generationB!: LocalMutationGeneration;

    await act(async () => {
      generationA = await hook.result.current.acquireLocalLock(ref, { durable: true });
      hook.result.current.acquireLocalLock(ref, {
        actionStateId: 901,
        generation: generationA,
      });
    });
    act(() => hook.result.current.releaseLocalLocksByActionStateId(901));
    expect(hook.result.current.isLocallyLocked(ref)).toBe(false);

    await act(async () => {
      generationB = await hook.result.current.acquireLocalLock(ref, { durable: true });
    });
    const pendingB = hook.result.current.localLocks[0]!;

    act(() => hook.result.current.settleLocalLock(ref, new Error('late settle A'), generationA));
    expect(hook.result.current.localLocks[0]).toMatchObject({
      pending: true,
      uncertaintyId: pendingB.uncertaintyId,
    });
    expect(window.localStorage.getItem(
      uncertaintyEntryKey(42, pendingB.key, pendingB.uncertaintyId!)
    )).not.toBeNull();

    act(() => hook.result.current.settleLocalLock(
      ref,
      new MissingActionStateError('VPS restart'),
      generationB
    ));
    expect(hook.result.current.localLocks[0]).toMatchObject({ uncertain: true });
    hook.unmount();
  });

  it('treats missing, forged and object-mismatched durable handles as no-ops', async () => {
    const hook = renderLocks();
    const ref = objectRef('Vps', 123);
    const otherRef = objectRef('Vps', 124);
    let generation!: LocalMutationGeneration;

    await act(async () => {
      generation = await hook.result.current.acquireLocalLock(ref, { durable: true });
    });
    const pending = hook.result.current.localLocks[0]!;
    const forged = {} as LocalMutationGeneration;

    act(() => hook.result.current.acquireLocalLock(ref, { actionStateId: 900 }));
    act(() => hook.result.current.acquireLocalLock(ref, { actionStateId: 901, generation: forged }));
    act(() => hook.result.current.acquireLocalLock(otherRef, { actionStateId: 902, generation }));
    act(() => hook.result.current.settleLocalLock(ref, new Error('forged'), forged));
    act(() => hook.result.current.settleLocalLock(otherRef, new Error('mismatch'), generation));

    expect(hook.result.current.localLocks[0]).toMatchObject({
      key: pending.key,
      pending: true,
      uncertaintyId: pending.uncertaintyId,
    });
    expect(window.localStorage.getItem(ordinaryEntryKey(42, ref.kind + ':' + ref.id))).toBeNull();
    expect(window.localStorage.getItem(ordinaryEntryKey(42, otherRef.kind + ':' + otherRef.id))).toBeNull();

    act(() => hook.result.current.settleLocalLock(ref, new Error('authoritative'), generation));
    expect(hook.result.current.isLocallyLocked(ref)).toBe(false);
    hook.unmount();
  });

  it('retains the exact pending marker when action-state lock storage fails', async () => {
    const hook = renderLocks();
    const ref = objectRef('Vps', 123);
    let generation!: LocalMutationGeneration;

    await act(async () => {
      generation = await hook.result.current.acquireLocalLock(ref, { durable: true });
    });
    const pending = hook.result.current.localLocks[0]!;
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota exceeded', 'QuotaExceededError');
    });
    act(() => hook.result.current.acquireLocalLock(ref, {
      actionStateId: 901,
      generation,
    }));
    expect(hook.result.current.localLocks[0]).toMatchObject({
      pending: true,
      uncertaintyId: pending.uncertaintyId,
    });
    expect(window.localStorage.getItem(ordinaryEntryKey(42, pending.key))).toBeNull();
    setItem.mockRestore();
    act(() => hook.result.current.settleLocalLock(ref, null, generation));
    expect(hook.result.current.localLocks[0]).toMatchObject({ actionStateId: 901 });
    expect(JSON.parse(window.localStorage.getItem(ordinaryEntryKey(42, pending.key))!))
      .toMatchObject({ actionStateId: 901 });
    hook.unmount();
  });

  it('preserves a bound action-state lock when marker removal initially fails', async () => {
    const hook = renderLocks();
    const ref = objectRef('Vps', 123);
    let generation!: LocalMutationGeneration;
    await act(async () => {
      generation = await hook.result.current.acquireLocalLock(ref, { durable: true });
    });
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('storage unavailable', 'SecurityError');
    });
    act(() => hook.result.current.acquireLocalLock(ref, { actionStateId: 901, generation }));
    expect(hook.result.current.localLocks[0]).toMatchObject({ pending: true });
    expect(JSON.parse(window.localStorage.getItem(ordinaryEntryKey(42, 'Vps:123'))!))
      .toMatchObject({ actionStateId: 901 });
    removeItem.mockRestore();
    act(() => hook.result.current.settleLocalLock(ref, null, generation));
    expect(hook.result.current.localLocks[0]).toMatchObject({ actionStateId: 901 });
    expect(window.localStorage.getItem(ordinaryEntryKey(42, 'Vps:123'))).not.toBeNull();
    hook.unmount();
  });

  it('promotes an orphaned pending marker to reconcilable uncertainty on mount', async () => {
    const ref = objectRef('IpAddress', 102);
    const intent = {
      type: 'ip-route-free' as const,
      previousNetworkInterfaceId: 51,
      expectedNetworkInterfaceId: null,
    };
    const pending = createLocalLock(ref, Date.now(), {
      pending: true,
      uncertaintyId: `${LEASE_GENERATION_PREFIX}pending-generation`,
      intent,
    });
    window.localStorage.setItem(
      uncertaintyEntryKey(42, pending.key, pending.uncertaintyId!),
      JSON.stringify(pending)
    );
    const hook = renderLocks();
    await waitFor(() => expect(hook.result.current.localLocks[0]).toMatchObject({
      uncertain: true,
      pending: undefined,
      uncertaintyId: `${LEASE_GENERATION_PREFIX}pending-generation`,
      intent,
    }));
    expect(JSON.parse(window.localStorage.getItem(
      uncertaintyEntryKey(42, pending.key, pending.uncertaintyId!)
    )!)).toMatchObject({ uncertain: true, intent });
    expect(window.localStorage.getItem(ordinaryEntryKey(42, pending.key))).toBeNull();
    act(() => hook.result.current.acknowledgeUncertainLocalLock(ref, pending.uncertaintyId));
    expect(hook.result.current.isLocallyLocked(ref)).toBe(false);
    hook.unmount();
  });

  it('fails closed when a persisted per-object guard entry is corrupt', async () => {
    window.localStorage.setItem(
      uncertaintyEntryKey(42, 'Vps:123', 'broken-generation'),
      '{not-json'
    );
    const hook = renderLocks();
    const ref = objectRef('Vps', 123);

    expect(hook.result.current.isLocallyLocked(ref)).toBe(true);
    await expect(hook.result.current.acquireLocalLock(ref, { durable: true }))
      .rejects.toSatisfy(isLocalLockPersistenceError);
    hook.unmount();
  });

  it('keeps an unknown persisted IP intent non-acknowledgeable', async () => {
    const ref = objectRef('IpAddress', 102);
    const corrupt = {
      ...createLocalLock(ref, Date.now(), {
        uncertain: true,
        uncertaintyId: 'unknown-intent-generation',
      }),
      intent: { type: 'ip-route-replace', expectedVpsId: 123 },
    };
    window.localStorage.setItem(
      uncertaintyEntryKey(42, corrupt.key, corrupt.uncertaintyId!),
      JSON.stringify(corrupt)
    );

    const hook = renderLocks();
    expect(hook.result.current.localLocks[0]).toMatchObject({
      key: 'IpAddress:102',
      pending: true,
      uncertain: undefined,
    });
    act(() => hook.result.current.acknowledgeUncertainLocalLock(ref, corrupt.uncertaintyId));
    expect(hook.result.current.isLocallyLocked(ref)).toBe(true);
    let acquireError: unknown;
    await act(async () => {
      try {
        await hook.result.current.acquireLocalLock(ref, { durable: true });
      } catch (error) {
        acquireError = error;
      }
    });
    expect(acquireError).toSatisfy(isLocalLockPersistenceError);
    hook.unmount();
  });

  it('removes a valid expired ordinary action-state lock on remount', () => {
    const ref = objectRef('Vps', 123);
    const expired = createLocalLock(ref, Date.now() - 10_000, {
      actionStateId: 901,
      ttlMs: 1,
    });
    window.localStorage.setItem(ordinaryEntryKey(42, expired.key), JSON.stringify(expired));

    const hook = renderLocks();
    expect(hook.result.current.isLocallyLocked(ref)).toBe(false);
    expect(window.localStorage.getItem(ordinaryEntryKey(42, expired.key))).toBeNull();
    hook.unmount();
  });

  it('keeps a corrupt ordinary entry fail-closed instead of treating it as expired', async () => {
    window.localStorage.setItem(ordinaryEntryKey(42, 'Vps:123'), '{not-json');
    const hook = renderLocks();
    const ref = objectRef('Vps', 123);

    expect(hook.result.current.isLocallyLocked(ref)).toBe(true);
    await expect(hook.result.current.acquireLocalLock(ref, { durable: true }))
      .rejects.toSatisfy(isLocalLockPersistenceError);
    hook.unmount();
  });

  it('settles overlapping same-object operations only in their captured user scope', async () => {
    const { result, rerender, unmount } = renderHook(
      ({ userId }) => useLocalMutationLocks({
        userId,
        persistenceErrorMessage: 'guard persistence failed',
        outcomeUncertainMessage: 'outcome uncertain',
      }),
      { initialProps: { userId: 42 } }
    );
    const ref = objectRef('Vps', 123);
    let generation42!: LocalMutationGeneration;

    await act(async () => {
      generation42 = await result.current.acquireLocalLock(ref, { durable: true });
    });
    const settleUser42 = result.current.settleLocalLock;
    const user42Key = [...Array(window.localStorage.length)]
      .map((_, index) => window.localStorage.key(index))
      .find((key) => key?.startsWith(`${LOCAL_LOCK_STORAGE_KEY}.user-42.uncertain.`));
    expect(user42Key).toBeTruthy();

    rerender({ userId: 43 });
    let generation43!: LocalMutationGeneration;
    await act(async () => {
      generation43 = await result.current.acquireLocalLock(ref, { durable: true });
    });
    const settleUser43 = result.current.settleLocalLock;
    const user43Key = [...Array(window.localStorage.length)]
      .map((_, index) => window.localStorage.key(index))
      .find((key) => key?.startsWith(`${LOCAL_LOCK_STORAGE_KEY}.user-43.uncertain.`));
    expect(user43Key).toBeTruthy();

    act(() => settleUser42(ref, new Error('authoritative rejection for user 42'), generation42));
    expect(window.localStorage.getItem(user42Key!)).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(user43Key!)!)).toMatchObject({
      key: 'Vps:123',
      pending: true,
    });
    expect(result.current.localLocks[0]).toMatchObject({ key: 'Vps:123', pending: true });

    act(() => settleUser43(ref, new MissingActionStateError('VPS start for user 43'), generation43));
    expect(window.localStorage.getItem(user42Key!)).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(user43Key!)!)).toMatchObject({
      key: 'Vps:123',
      uncertain: true,
    });

    expect(window.localStorage.getItem(ordinaryEntryKey(43, 'Vps:123'))).toBeNull();
    unmount();
  });

  it('fails before a mutation can start when durable storage cannot be verified', async () => {
    const hook = renderLocks();
    const ref = objectRef('Vps', 123);
    let mutationStarts = 0;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota exceeded', 'QuotaExceededError');
    });

    const guardedMutation = async () => {
      await hook.result.current.acquireLocalLock(ref, { durable: true });
      mutationStarts += 1;
    };
    await expect(guardedMutation()).rejects.toSatisfy(isLocalLockPersistenceError);
    expect(mutationStarts).toBe(0);
    hook.unmount();
  });
});
