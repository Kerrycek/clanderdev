import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isLocalLockPersistenceError } from './localLocks';
import {
  beginVpsCreateOutcomeGuard,
  clearVpsCreateOutcomeMarker,
  markVpsCreateOutcomeAccepted,
  markVpsCreateOutcomeUncertain,
  readLatestVpsCreateOutcomeMarker,
  vpsCreateOutcomeEntryPrefix,
} from './vpsCreateOutcomeGuard';

function installSerialWebLocks() {
  let tail = Promise.resolve<unknown>(undefined);
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: vi.fn(<T,>(_name: string, callback: () => T | Promise<T>): Promise<T> => {
        const next = tail.then(callback, callback);
        tail = next.then(() => undefined, () => undefined);
        return next;
      }),
    },
  });
}

const guardArgs = {
  userId: 42,
  persistenceErrorMessage: 'guard persistence failed',
  outcomeUncertainMessage: 'outcome uncertain',
};

beforeEach(() => {
  window.localStorage.clear();
  installSerialWebLocks();
});

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'locks');
});

describe('VPS create outcome guard', () => {
  it('serializes concurrent tabs so only one create can start', async () => {
    let createStarts = 0;
    const start = async () => {
      await beginVpsCreateOutcomeGuard(guardArgs);
      createStarts += 1;
    };

    const results = await Promise.allSettled([start(), start()]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(createStarts).toBe(1);
  });

  it('clears only the reviewed generation and preserves a newer marker', async () => {
    const first = await beginVpsCreateOutcomeGuard(guardArgs);
    const second = { id: 'newer-generation', createdAt: first.createdAt + 1, phase: 'uncertain' as const };
    window.localStorage.setItem(
      `${vpsCreateOutcomeEntryPrefix(42)}${encodeURIComponent(second.id)}`,
      JSON.stringify(second)
    );

    await clearVpsCreateOutcomeMarker({
      userId: 42,
      marker: first,
      persistenceErrorMessage: guardArgs.persistenceErrorMessage,
    });
    expect(readLatestVpsCreateOutcomeMarker(42)).toEqual(second);
  });

  it('keeps an in-flight marker non-acknowledgeable until it becomes uncertain', async () => {
    const pending = await beginVpsCreateOutcomeGuard(guardArgs);
    expect(pending.phase).toBe('pending');
    const uncertain = await markVpsCreateOutcomeUncertain({
      userId: 42,
      marker: pending,
      persistenceErrorMessage: guardArgs.persistenceErrorMessage,
    });
    expect(readLatestVpsCreateOutcomeMarker(42)).toEqual({ ...pending, phase: 'uncertain' });
    expect(uncertain.phase).toBe('uncertain');
  });

  it('persists an accepted receipt before the pending create marker can be cleared', async () => {
    const pending = await beginVpsCreateOutcomeGuard({
      ...guardArgs,
      identity: { hostname: 'created.example', ownerId: 42, locationId: 7 },
    });
    const accepted = await markVpsCreateOutcomeAccepted({
      userId: 42,
      marker: pending,
      candidateVpsId: 123,
      actionStateId: 987,
      persistenceErrorMessage: guardArgs.persistenceErrorMessage,
    });

    expect(readLatestVpsCreateOutcomeMarker(42)).toEqual(accepted);
    expect(accepted).toMatchObject({ phase: 'accepted', candidateVpsId: 123, actionStateId: 987 });
  });

  it('treats a corrupt persisted generation as a non-acknowledgeable pending guard', async () => {
    window.localStorage.setItem(`${vpsCreateOutcomeEntryPrefix(42)}broken-generation`, '{not-json');

    expect(readLatestVpsCreateOutcomeMarker(42)).toMatchObject({
      id: 'broken-generation',
      phase: 'pending',
    });
    await expect(beginVpsCreateOutcomeGuard(guardArgs)).rejects.toSatisfy(isLocalLockPersistenceError);
  });

  it('does not allow a create request when durable storage cannot be verified', async () => {
    let createStarts = 0;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota exceeded', 'QuotaExceededError');
    });

    const guardedCreate = async () => {
      await beginVpsCreateOutcomeGuard(guardArgs);
      createStarts += 1;
    };
    await expect(guardedCreate()).rejects.toSatisfy(isLocalLockPersistenceError);
    expect(createStarts).toBe(0);
  });
});
