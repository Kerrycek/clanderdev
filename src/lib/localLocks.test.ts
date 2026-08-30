import { describe, expect, it } from 'vitest';

import { objectRef } from './objectRef';
import {
  LOCAL_LOCK_TTL_BOUND_MS,
  LOCAL_LOCK_TTL_UNBOUND_MS,
  createLocalLock,
  acknowledgeUncertainLocalLock,
  localLockActionStateIds,
  normalizeLocalLock,
  normalizeLocalMutationIntent,
  parseLocalLocksFromStorage,
  pruneLocalLocks,
  releaseLocalLock,
  releaseLocalLocksByActionStateId,
  upsertLocalLock,
} from './localLocks';

describe('localLocks', () => {
  it('round-trips strict allowlisted IP mutation intents', () => {
    const intent = {
      type: 'ip-route-assign' as const,
      previousNetworkInterfaceId: null,
      expectedNetworkInterfaceId: 501,
      expectedVpsId: 123,
    };
    const lock = createLocalLock(objectRef('IpAddress', 10), 1_000_000, {
      uncertain: true,
      uncertaintyId: 'generation-1',
      intent,
    });

    expect(normalizeLocalMutationIntent(intent)).toEqual(intent);
    expect(normalizeLocalLock(JSON.parse(JSON.stringify(lock)))).toEqual(lock);
  });

  it('rejects unknown, corrupt and wrongly scoped mutation intents', () => {
    const base = {
      key: 'IpAddress:10',
      kind: 'IpAddress',
      id: 10,
      acquiredAt: 1_000_000,
      expiresAt: Number.MAX_SAFE_INTEGER,
      uncertain: true,
      uncertaintyId: 'generation-1',
    };

    expect(normalizeLocalMutationIntent({ type: 'ip-route-replace' })).toBeNull();
    expect(normalizeLocalMutationIntent({
      type: 'ip-route-free',
      previousNetworkInterfaceId: 501,
      expectedNetworkInterfaceId: null,
      unexpected: true,
    })).toBeNull();
    expect(normalizeLocalLock({
      ...base,
      intent: { type: 'ip-route-free', previousNetworkInterfaceId: 0, expectedNetworkInterfaceId: null },
    })).toBeNull();
    expect(normalizeLocalLock({
      ...base,
      key: 'Vps:10',
      kind: 'Vps',
      intent: { type: 'ip-route-free', previousNetworkInterfaceId: 501, expectedNetworkInterfaceId: null },
    })).toBeNull();
  });

  it('creates unbound lock with default TTL', () => {
    const now = 1_000_000;
    const lock = createLocalLock(objectRef('Vps', 1), now);
    expect(lock.actionStateId).toBeUndefined();
    expect(lock.expiresAt - now).toBe(LOCAL_LOCK_TTL_UNBOUND_MS);
  });

  it('creates bound lock with default TTL', () => {
    const now = 1_000_000;
    const lock = createLocalLock(objectRef('Vps', 1), now, { actionStateId: 55 });
    expect(lock.actionStateId).toBe(55);
    expect(lock.expiresAt - now).toBe(LOCAL_LOCK_TTL_BOUND_MS);
  });

  it('prunes expired and malformed locks on parse', () => {
    const now = 1_000_000;
    const raw = JSON.stringify([
      { key: 'Vps:1', acquiredAt: now - 1_000, expiresAt: now + 1_000 },
      { key: 'Dataset:2', acquiredAt: now - 1_000, expiresAt: now - 1 }, // expired
      { key: 'Nope:3', acquiredAt: now - 1_000, expiresAt: now + 1_000 }, // invalid kind
      { foo: 'bar' },
    ]);
    const locks = parseLocalLocksFromStorage(raw, now);
    expect(locks).toHaveLength(1);
    expect(locks[0]?.key).toBe('Vps:1');
  });

  it('upserts and upgrades to bound lock', () => {
    const now = 1_000_000;
    const ref = objectRef('Dataset', 10);
    let locks = upsertLocalLock([], ref, now);
    expect(locks).toHaveLength(1);
    expect(locks[0]?.actionStateId).toBeUndefined();

    locks = upsertLocalLock(locks, ref, now + 10, { actionStateId: 123 });
    expect(locks).toHaveLength(1);
    expect(locks[0]?.actionStateId).toBe(123);
  });

  it('releaseLocalLock removes only unbound locks', () => {
    const now = 1_000_000;
    const ref = objectRef('Vps', 3);
    let locks = upsertLocalLock([], ref, now);
    locks = releaseLocalLock(locks, ref);
    expect(locks).toHaveLength(0);

    locks = upsertLocalLock([], ref, now, { actionStateId: 999 });
    locks = releaseLocalLock(locks, ref);
    expect(locks).toHaveLength(1);
  });

  it('keeps an uncertain lock active without a timeout until explicitly released', () => {
    const now = 1_000_000;
    const ref = objectRef('Vps', 4);
    const locks = upsertLocalLock([], ref, now, { uncertain: true });

    expect(locks[0]?.uncertain).toBe(true);
    expect(pruneLocalLocks(locks, Number.MAX_SAFE_INTEGER - 1)).toHaveLength(1);
    expect(releaseLocalLock(locks, ref)).toHaveLength(1);
    expect(acknowledgeUncertainLocalLock(locks, ref)).toHaveLength(0);
  });

  it('keeps an in-flight durable marker active and immune to ordinary release', () => {
    const now = 1_000_000;
    const ref = objectRef('Vps', 40);
    const locks = upsertLocalLock([], ref, now, {
      pending: true,
      uncertaintyId: 'request-generation',
    });

    expect(locks[0]).toMatchObject({ pending: true, uncertaintyId: 'request-generation' });
    expect(pruneLocalLocks(locks, Number.MAX_SAFE_INTEGER - 1)).toHaveLength(1);
    expect(releaseLocalLock(locks, ref)).toEqual(locks);
    expect(acknowledgeUncertainLocalLock(locks, ref, 'request-generation')).toEqual(locks);
  });

  it('preserves uncertain locks across storage parsing', () => {
    const now = 1_000_000;
    const raw = JSON.stringify([
      {
        key: 'Vps:5',
        acquiredAt: now,
        expiresAt: Number.MAX_SAFE_INTEGER,
        uncertain: true,
      },
    ]);

    expect(parseLocalLocksFromStorage(raw, now + LOCAL_LOCK_TTL_BOUND_MS * 10)).toEqual([
      expect.objectContaining({ key: 'Vps:5', uncertain: true }),
    ]);
  });

  it('does not downgrade an uncertain lock during another local acquire', () => {
    const now = 1_000_000;
    const ref = objectRef('Vps', 6);
    let locks = upsertLocalLock([], ref, now, { uncertain: true });
    locks = upsertLocalLock(locks, ref, now + 10);

    expect(locks[0]?.uncertain).toBe(true);
  });

  it('never evicts an uncertain lock when the ordinary lock cache reaches its limit', () => {
    const now = 1_000_000;
    const protectedRef = objectRef('Vps', 999);
    let locks = upsertLocalLock([], protectedRef, now, { uncertain: true });
    for (let id = 1; id <= 250; id += 1) {
      locks = upsertLocalLock(locks, objectRef('Vps', id), now + id);
    }

    expect(locks.some((lock) => lock.key === 'Vps:999' && lock.uncertain === true)).toBe(true);
  });

  it('never evicts a pending durable marker when the ordinary cache reaches its limit', () => {
    const now = 1_000_000;
    const protectedRef = objectRef('Vps', 998);
    let locks = upsertLocalLock([], protectedRef, now, {
      pending: true,
      uncertaintyId: 'request-generation',
    });
    for (let id = 1; id <= 250; id += 1) {
      locks = upsertLocalLock(locks, objectRef('Vps', id), now + id);
    }

    expect(locks.some((lock) => lock.key === 'Vps:998' && lock.pending === true)).toBe(true);
  });

  it('releaseLocalLocksByActionStateId removes bound locks', () => {
    const now = 1_000_000;
    const a = objectRef('Vps', 1);
    const b = objectRef('Vps', 2);
    let locks = upsertLocalLock([], a, now, { actionStateId: 11 });
    locks = upsertLocalLock(locks, b, now, { actionStateId: 12 });
    locks = releaseLocalLocksByActionStateId(locks, 11);
    expect(locks).toHaveLength(1);
    expect(locks[0]?.key).toBe('Vps:2');
  });

  it('lists unique actionStateIds', () => {
    const now = 1_000_000;
    const a = objectRef('Vps', 1);
    const b = objectRef('Vps', 2);
    let locks = upsertLocalLock([], a, now, { actionStateId: 11 });
    locks = upsertLocalLock(locks, b, now, { actionStateId: 11 });
    locks = upsertLocalLock(locks, b, now, { actionStateId: 12 });
    const ids = localLockActionStateIds(pruneLocalLocks(locks, now));
    expect(ids.sort((x, y) => x - y)).toEqual([11, 12]);
  });
});
