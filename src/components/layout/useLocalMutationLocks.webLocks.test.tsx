import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createLocalLock, LOCAL_LOCK_STORAGE_KEY } from '../../lib/localLocks';
import { objectRef } from '../../lib/objectRef';
import { useLocalMutationLocks } from './useLocalMutationLocks';
import { installSerialWebLocks } from './webLocksTestMock';

const renderLocks = () => renderHook(() => useLocalMutationLocks({
  userId: 42,
  persistenceErrorMessage: 'guard persistence failed',
  outcomeUncertainMessage: 'outcome uncertain',
}));
const storageKey = (key: string, id: string) => (
  `${LOCAL_LOCK_STORAGE_KEY}.user-42.uncertain.${encodeURIComponent(key)}.${encodeURIComponent(id)}`
);

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'locks');
});

it('keeps an arbitrarily old lease-less marker pending and non-acknowledgeable', async () => {
  installSerialWebLocks();
  const ref = objectRef('Vps', 123);
  const pending = createLocalLock(ref, 1, { pending: true, uncertaintyId: 'old-build-live-request' });
  window.localStorage.setItem(storageKey(pending.key, pending.uncertaintyId!), JSON.stringify(pending));
  const observer = renderLocks();
  await waitFor(() => expect(observer.result.current.localLocks[0]).toMatchObject({ pending: true }));
  await new Promise((resolve) => window.setTimeout(resolve, 50));
  act(() => observer.result.current.acknowledgeUncertainLocalLock(ref, pending.uncertaintyId));
  expect(observer.result.current.localLocks[0]).toMatchObject({ pending: true, uncertain: undefined });
  observer.unmount();
});

it('does not promote or acknowledge another live tab pending marker, then recovers it after owner crash', async () => {
  const webLocks = installSerialWebLocks();
  const ref = objectRef('IpAddress', 102);
  const intent = {
    type: 'ip-route-free' as const,
    previousNetworkInterfaceId: 51,
    expectedNetworkInterfaceId: null,
  };
  const owner = renderLocks();
  await act(async () => {
    await owner.result.current.acquireLocalLock(ref, { durable: true, intent });
  });
  const pending = owner.result.current.localLocks[0]!;
  const observer = renderLocks();
  await waitFor(() => expect(observer.result.current.localLocks[0]).toMatchObject({
    pending: true,
    uncertain: undefined,
    uncertaintyId: pending.uncertaintyId,
  }));
  act(() => observer.result.current.acknowledgeUncertainLocalLock(ref, pending.uncertaintyId));
  expect(observer.result.current.localLocks[0]).toMatchObject({ pending: true });
  expect(window.localStorage.getItem(storageKey(pending.key, pending.uncertaintyId!))).not.toBeNull();

  await new Promise((resolve) => window.setTimeout(resolve, 1_100));
  expect(observer.result.current.localLocks[0]).toMatchObject({ pending: true, uncertain: undefined });
  webLocks.crashAll();
  await waitFor(() => expect(observer.result.current.localLocks[0]).toMatchObject({
    pending: undefined,
    uncertain: true,
    uncertaintyId: pending.uncertaintyId,
    intent,
  }), { timeout: 2_500 });
  act(() => observer.result.current.acknowledgeUncertainLocalLock(ref, pending.uncertaintyId));
  expect(observer.result.current.isLocallyLocked(ref)).toBe(false);
  owner.unmount();
  observer.unmount();
});
