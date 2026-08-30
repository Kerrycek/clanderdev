import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  LOCAL_LOCK_STORAGE_KEY,
  LocalLockPersistenceError,
  acknowledgeUncertainLocalLock as acknowledgeUncertainLocalLockReducer,
  createLocalLock,
  isLocalLockActive,
  isLocalLockPersistenceError,
  parseLocalLocksFromStorage,
  pruneLocalLocks,
  releaseLocalLock as releaseLocalLockReducer,
  releaseDurableLocalLockGeneration,
  releaseLocalLocksByActionStateId as releaseLocalLocksByActionStateIdReducer,
  type AcquireLocalMutationLock,
  type LocalLock,
  type LocalMutationGeneration,
  type LocalMutationIntent,
} from '../../lib/localLocks';
import { isAmbiguousMutationError } from '../../lib/api/haveapi';
import { objectRefKey, type ObjectRef } from '../../lib/objectRef';
import {
  corruptStoredLock, generationLeaseName, generatedKey, inspectStoredLock, LEASE_GENERATION_PREFIX,
  newGenerationId, ordinaryKey, ordinaryPrefix, promotePendingLockIfOrphan, readLatestGuard,
  readLocks, readOrdinary, replaceLock, uncertainPrefix, verifiedRemoveItem, verifiedSetItem,
} from './localMutationLockStorage';

export function useLocalMutationLocks(args: {
  userId?: number;
  persistenceErrorMessage: string;
  outcomeUncertainMessage: string;
}) {
  const scopeKey = `${LOCAL_LOCK_STORAGE_KEY}.user-${args.userId ?? 'anonymous'}`;
  const ordinaryEntryPrefix = useMemo(() => ordinaryPrefix(scopeKey), [scopeKey]);
  const uncertaintyEntryPrefix = useMemo(() => uncertainPrefix(scopeKey), [scopeKey]);
  const activeScopeKeyRef = useRef(scopeKey);
  activeScopeKeyRef.current = scopeKey;
  type PendingOperation = {
    id: string;
    objectKey: string;
    scopeKey: string;
    ordinaryEntryPrefix: string;
    uncertaintyEntryPrefix: string;
    intent?: LocalMutationIntent;
    boundActionStateId?: number;
    releaseLease: () => void;
  };
  const pendingOperationsRef = useRef<WeakMap<LocalMutationGeneration, PendingOperation>>(new WeakMap());

  const [localLocks, setLocalLocks] = useState<LocalLock[]>(() => {
    if (typeof window === 'undefined') return [];
    // The old session array cannot be attributed after an A -> B switch, so
    // never hydrate or migrate it into the current user's namespace.
    const legacy = window.localStorage.getItem(scopeKey);
    return readLocks(ordinaryEntryPrefix, uncertaintyEntryPrefix, legacy, Date.now());
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.removeItem(LOCAL_LOCK_STORAGE_KEY);
    } catch {
      // Storage can be unavailable in hardened browser modes. The
      // unattributable value is still deliberately ignored above.
    }
    try {
      // This older localStorage array was already user-scoped and is safe to migrate.
      const legacy = window.localStorage.getItem(scopeKey);
      const scoped = readLocks(ordinaryEntryPrefix, uncertaintyEntryPrefix, legacy, Date.now());
      setLocalLocks(scoped);

      // Only migrate the old array-shaped storage value. Re-writing the
      // already per-entry records would duplicate a durable pending marker as
      // an ordinary lock and make an authoritative failure impossible to
      // clear after a reload.
      const legacyLocks = parseLocalLocksFromStorage(legacy, Date.now());
      if (legacyLocks.length === 0) return;
      let complete = true;
      for (const lock of legacyLocks) {
        const guarded = lock.uncertain === true || lock.pending === true;
        const identified = guarded && !lock.uncertaintyId
          ? { ...lock, uncertaintyId: newGenerationId(lock.acquiredAt) }
          : lock;
        const next = identified.pending === true && identified.uncertaintyId
          ? createLocalLock({ kind: identified.kind, id: identified.id }, identified.acquiredAt, {
            uncertain: true,
            uncertaintyId: identified.uncertaintyId,
            intent: identified.intent,
          })
          : identified;
        const key = next.uncertain === true || next.pending === true
          ? generatedKey(uncertaintyEntryPrefix, next)
          : ordinaryKey(ordinaryEntryPrefix, next.key);
        complete = verifiedSetItem(key, JSON.stringify(next)) && complete;
      }
      if (complete) {
        window.localStorage.removeItem(scopeKey);
        setLocalLocks(readLocks(ordinaryEntryPrefix, uncertaintyEntryPrefix, null, Date.now()));
      }
    } catch {
      // Keep legacy storage intact when migration cannot be proven durable.
    }
  }, [ordinaryEntryPrefix, scopeKey, uncertaintyEntryPrefix]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof navigator.locks?.request !== 'function') return;
    let cancelled = false;
    const recover = async () => {
      const persisted = readLocks(ordinaryEntryPrefix, uncertaintyEntryPrefix, null, Date.now());
      await Promise.all(persisted.map(
        (lock) => promotePendingLockIfOrphan(lock, scopeKey, uncertaintyEntryPrefix)
      ));
      const current = readLocks(ordinaryEntryPrefix, uncertaintyEntryPrefix, null, Date.now());
      if (!cancelled && scopeKey === activeScopeKeyRef.current) setLocalLocks(current);
    };
    void recover();
    const interval = window.setInterval(() => void recover(), 1_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [ordinaryEntryPrefix, scopeKey, uncertaintyEntryPrefix]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onStorage = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage || !event.key) return;
      const uncertaintyEvent = event.key.startsWith(uncertaintyEntryPrefix);
      const ordinaryEvent = event.key.startsWith(ordinaryEntryPrefix);
      if (!uncertaintyEvent && !ordinaryEvent) return;

      const now = Date.now();
      const eventValue = event.newValue ?? event.oldValue;
      const inspected = inspectStoredLock(eventValue, now);
      const eventLock = uncertaintyEvent
        ? corruptStoredLock(event.key, uncertaintyEntryPrefix, now, true)
        : inspected.lock ?? corruptStoredLock(event.key, ordinaryEntryPrefix, now, false);
      let objectKey = eventLock?.key;
      if (!objectKey && ordinaryEvent) {
        try {
          objectKey = decodeURIComponent(event.key.slice(ordinaryEntryPrefix.length));
        } catch {
          return;
        }
      }
      if (!objectKey) return;

      setLocalLocks((prev) => {
        const uncertainty = readLatestGuard(uncertaintyEntryPrefix, objectKey, now);
        if (uncertainty) return replaceLock(prev, uncertainty);
        const ordinary = readOrdinary(ordinaryEntryPrefix, objectKey, now);
        return ordinary ? replaceLock(prev, ordinary) : prev.filter((lock) => lock.key !== objectKey);
      });
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [ordinaryEntryPrefix, uncertaintyEntryPrefix]);

  const persistOrdinary = useCallback((lock: LocalLock) => (
    verifiedSetItem(ordinaryKey(ordinaryEntryPrefix, lock.key), JSON.stringify(lock))
  ), [ordinaryEntryPrefix]);

  const persistGuard = useCallback((lock: LocalLock) => (
    (lock.uncertain === true || lock.pending === true)
      && Boolean(lock.uncertaintyId)
      && verifiedSetItem(generatedKey(uncertaintyEntryPrefix, lock), JSON.stringify(lock))
  ), [uncertaintyEntryPrefix]);

  const removeOrdinary = useCallback((objectKey: string) => (
    verifiedRemoveItem(ordinaryKey(ordinaryEntryPrefix, objectKey))
  ), [ordinaryEntryPrefix]);

  const removeUncertainty = useCallback((lock: Pick<LocalLock, 'key' | 'uncertaintyId'>) => (
    Boolean(lock.uncertaintyId)
      && verifiedRemoveItem(generatedKey(uncertaintyEntryPrefix, lock))
  ), [uncertaintyEntryPrefix]);

  const exactPendingOperation = useCallback((
    ref: ObjectRef,
    generation: LocalMutationGeneration | undefined
  ): PendingOperation | undefined => {
    if (!generation || typeof generation !== 'object') return undefined;
    const operation = pendingOperationsRef.current.get(generation);
    return operation
      && objectRefKey(ref) === operation.objectKey
      ? operation
      : undefined;
  }, []);

  const acquireDurable = useCallback(async (
    ref: ObjectRef,
    intent?: LocalMutationIntent
  ): Promise<LocalMutationGeneration> => {
    if (typeof window === 'undefined' || typeof navigator.locks?.request !== 'function') {
      throw new LocalLockPersistenceError(args.persistenceErrorMessage);
    }

    const objectKey = objectRefKey(ref);
    return navigator.locks.request(`${scopeKey}.mutation.${encodeURIComponent(objectKey)}`, async () => {
      const now = Date.now();
      const persistedUncertainty = readLatestGuard(uncertaintyEntryPrefix, objectKey, now);
      const persistedOrdinary = readOrdinary(ordinaryEntryPrefix, objectKey, now);
      if (persistedUncertainty || persistedOrdinary) {
        const persisted = persistedUncertainty ?? persistedOrdinary;
        if (persisted) setLocalLocks((prev) => replaceLock(prev, persisted));
        throw new LocalLockPersistenceError(args.outcomeUncertainMessage);
      }

      const uncertaintyId = `${LEASE_GENERATION_PREFIX}${newGenerationId(now)}`;
      const marker = createLocalLock(ref, now, { pending: true, uncertaintyId, intent });
      let releaseLease!: () => void;
      const leaseReleased = new Promise<void>((resolve) => {
        releaseLease = resolve;
      });
      let leaseAcquired!: (acquired: boolean) => void;
      const leaseReady = new Promise<boolean>((resolve) => {
        leaseAcquired = resolve;
      });
      void navigator.locks.request(generationLeaseName(scopeKey, marker), { ifAvailable: true }, async (lease) => {
        leaseAcquired(Boolean(lease));
        if (lease) await leaseReleased;
      }).catch(() => leaseAcquired(false));
      if (!await leaseReady) throw new LocalLockPersistenceError(args.persistenceErrorMessage);
      if (!persistGuard(marker)) {
        releaseLease();
        throw new LocalLockPersistenceError(args.persistenceErrorMessage);
      }

      const generation = {} as LocalMutationGeneration;
      pendingOperationsRef.current.set(generation, {
        id: uncertaintyId,
        objectKey,
        scopeKey,
        ordinaryEntryPrefix,
        uncertaintyEntryPrefix,
        intent,
        releaseLease,
      });
      setLocalLocks((prev) => replaceLock(pruneLocalLocks(prev, now), marker));
      return generation;
    });
  }, [args.outcomeUncertainMessage, args.persistenceErrorMessage, ordinaryEntryPrefix, persistGuard, scopeKey, uncertaintyEntryPrefix]);

  const acquireLocalLock = useCallback((
    ref: ObjectRef,
    opts?: {
      actionStateId?: number;
      ttlMs?: number;
      uncertain?: boolean;
      pending?: boolean;
      uncertaintyId?: string;
      durable?: boolean;
      intent?: LocalMutationIntent;
      generation?: LocalMutationGeneration;
    }
  ): void | Promise<LocalMutationGeneration> => {
    const now = Date.now();
    const objectKey = objectRefKey(ref);
    if (opts?.actionStateId !== undefined) {
      const operation = exactPendingOperation(ref, opts.generation);
      // A supplied generation is a capability. Unknown, forged or
      // object-mismatched capabilities never fall back to object-key lookup.
      if (opts.generation && !operation) return;
      // Likewise, an unscoped action-state binding may not consume whichever
      // durable generation happens to be latest for this object.
      if (!opts.generation && readLatestGuard(uncertaintyEntryPrefix, objectKey, now)) return;
      const confirmed = createLocalLock(ref, now, opts);
      const confirmedPrefix = operation?.ordinaryEntryPrefix ?? ordinaryEntryPrefix;
      const guardPrefix = operation?.uncertaintyEntryPrefix ?? uncertaintyEntryPrefix;
      let markerKey: string | undefined;
      if (operation) {
        markerKey = generatedKey(guardPrefix, { key: objectKey, uncertaintyId: operation.id });
        const marker = inspectStoredLock(window.localStorage.getItem(markerKey), now);
        if (marker.status !== 'active'
          || marker.lock?.pending !== true
          || marker.lock.key !== objectKey
          || marker.lock.uncertaintyId !== operation.id) return;
        if (operation.boundActionStateId !== undefined
          && operation.boundActionStateId !== confirmed.actionStateId) return;
        operation.boundActionStateId = confirmed.actionStateId;
      }
      if (!verifiedSetItem(ordinaryKey(confirmedPrefix, confirmed.key), JSON.stringify(confirmed))) {
        const uncertainty = readLatestGuard(guardPrefix, objectKey, now);
        if (uncertainty && (operation?.scopeKey ?? scopeKey) === activeScopeKeyRef.current) {
          setLocalLocks((prev) => replaceLock(prev, uncertainty));
        }
        return;
      }
      if (operation) {
        if (!verifiedRemoveItem(markerKey!)) {
          // The ordinary action-state lock may have been persisted, but the
          // exact durable marker could not be proven and removed. Keep the
          // request fail-closed and retain the capability for a safe retry.
          if (operation.scopeKey === activeScopeKeyRef.current) {
            const guarded = readLatestGuard(guardPrefix, objectKey, now);
            if (guarded) setLocalLocks((prev) => replaceLock(prev, guarded));
          }
          return;
        }
        pendingOperationsRef.current.delete(opts.generation!);
        operation.releaseLease();
      }
      if ((operation?.scopeKey ?? scopeKey) === activeScopeKeyRef.current) {
        const remaining = readLatestGuard(guardPrefix, objectKey, now);
        setLocalLocks((prev) => replaceLock(prev, remaining ?? confirmed));
      }
      return;
    }
    if (opts?.durable === true) return acquireDurable(ref, opts.intent);

    const ordinary = createLocalLock(ref, now, opts);
    persistOrdinary(ordinary);
    setLocalLocks((prev) => replaceLock(pruneLocalLocks(prev, now), ordinary));
  }, [acquireDurable, exactPendingOperation, persistOrdinary, scopeKey, uncertaintyEntryPrefix]) as AcquireLocalMutationLock;

  const releaseLocalLock = useCallback((ref: ObjectRef) => {
    const objectKey = objectRefKey(ref);
    setLocalLocks((prev) => {
      const next = releaseLocalLockReducer(prev, ref);
      const remaining = readLatestGuard(uncertaintyEntryPrefix, objectKey, Date.now());
      if (remaining) return replaceLock(next, remaining);
      if (!next.some((lock) => lock.key === objectKey)) removeOrdinary(objectKey);
      return next;
    });
  }, [removeOrdinary, uncertaintyEntryPrefix]);

  const settleLocalLock = useCallback(function settleExactLocalLock(
    ref: ObjectRef,
    error: unknown,
    generation?: LocalMutationGeneration
  ) {
    const objectKey = objectRefKey(ref);
    // A rejected durable acquire never started a new mutation and therefore
    // has no operation generation to settle. In particular, do not pop an
    // older in-flight generation for the same object when React Query still
    // invokes onSettled for the rejected second attempt.
    if (!generation && isLocalLockPersistenceError(error)) {
      const now = Date.now();
      const persisted = readLatestGuard(uncertaintyEntryPrefix, objectKey, now)
        ?? readOrdinary(ordinaryEntryPrefix, objectKey, now);
      if (persisted) setLocalLocks((prev) => replaceLock(prev, persisted));
      return;
    }
    const operation = exactPendingOperation(ref, generation);
    // Never infer a durable request generation from an object key. A missing,
    // forged, stale or mismatched handle is a fail-closed no-op while a
    // durable marker exists.
    if (generation && !operation) return;
    if (!generation) {
      const persistedGuard = readLatestGuard(uncertaintyEntryPrefix, objectKey, Date.now());
      if (persistedGuard) {
        setLocalLocks((prev) => replaceLock(prev, persistedGuard));
        return;
      }
      setLocalLocks((prev) => {
        const next = releaseLocalLockReducer(prev, ref);
        if (!next.some((lock) => lock.key === objectKey)) removeOrdinary(objectKey);
        return next;
      });
      return;
    }
    if (!operation) return;

    const operationId = operation.id;
    const guardPrefix = operation.uncertaintyEntryPrefix;
    const sameScope = operation.scopeKey === activeScopeKeyRef.current;
    const markerKey = generatedKey(guardPrefix, { key: objectKey, uncertaintyId: operationId });
    const marker = inspectStoredLock(window.localStorage.getItem(markerKey), Date.now());
    if (marker.status !== 'active'
      || marker.lock?.pending !== true
      || marker.lock.key !== objectKey
      || marker.lock.uncertaintyId !== operationId) {
      window.setTimeout(() => settleExactLocalLock(ref, error, generation), 1_000);
      return;
    }
    if (operation.boundActionStateId !== undefined) {
      const now = Date.now();
      let bound = readOrdinary(operation.ordinaryEntryPrefix, objectKey, now);
      if (bound?.actionStateId !== operation.boundActionStateId) {
        const confirmed = createLocalLock(ref, now, { actionStateId: operation.boundActionStateId });
        if (!verifiedSetItem(ordinaryKey(operation.ordinaryEntryPrefix, objectKey), JSON.stringify(confirmed))) {
          window.setTimeout(() => settleExactLocalLock(ref, error, generation), 1_000);
          return;
        }
        bound = confirmed;
      }
      if (!verifiedRemoveItem(markerKey)) {
        window.setTimeout(() => settleExactLocalLock(ref, error, generation), 1_000);
        return;
      }
      pendingOperationsRef.current.delete(generation);
      operation.releaseLease();
      if (sameScope) setLocalLocks((prev) => replaceLock(
        releaseDurableLocalLockGeneration(prev, ref, operationId),
        bound
      ));
      return;
    }
    if (isAmbiguousMutationError(error)) {
      const now = Date.now();
      const persisted = marker.lock;
      const uncertainty = createLocalLock(ref, persisted.acquiredAt, {
        uncertain: true,
        uncertaintyId: operationId,
        intent: operation.intent ?? persisted.intent,
      });
      // The pending marker is already durable. If rewriting it fails, retain
      // that non-acknowledgeable marker rather than exposing an unsafe retry.
      const converted = ((uncertainty.uncertain === true || uncertainty.pending === true)
        && Boolean(uncertainty.uncertaintyId)
        && verifiedSetItem(generatedKey(guardPrefix, uncertainty), JSON.stringify(uncertainty)));
      const stored = converted ? uncertainty : persisted;
      if (!converted) {
        if (sameScope) setLocalLocks((prev) => replaceLock(pruneLocalLocks(prev, now), stored));
        window.setTimeout(() => settleExactLocalLock(ref, error, generation), 1_000);
        return;
      }
      pendingOperationsRef.current.delete(generation);
      operation.releaseLease();
      if (sameScope) setLocalLocks((prev) => replaceLock(pruneLocalLocks(prev, now), stored));
      return;
    }
    if (!verifiedRemoveItem(markerKey)) {
      window.setTimeout(() => settleExactLocalLock(ref, error, generation), 1_000);
      return;
    }
    pendingOperationsRef.current.delete(generation);
    operation.releaseLease();
    if (!sameScope) return;
    setLocalLocks((prev) => {
      const next = releaseDurableLocalLockGeneration(prev, ref, operationId);
      const remaining = readLatestGuard(uncertaintyEntryPrefix, objectKey, Date.now());
      if (remaining) return replaceLock(next, remaining);
      if (!next.some((lock) => lock.key === objectKey)) removeOrdinary(objectKey);
      return next;
    });
  }, [exactPendingOperation, ordinaryEntryPrefix, removeOrdinary, uncertaintyEntryPrefix]);

  const acknowledgeUncertainLocalLock = useCallback((ref: ObjectRef, uncertaintyId?: string) => {
    if (!uncertaintyId) return;
    const objectKey = objectRefKey(ref);
    setLocalLocks((prev) => {
      const acknowledgeable = prev.some(
        (lock) => lock.key === objectKey
          && lock.uncertain === true
          && lock.uncertaintyId === uncertaintyId
      );
      if (!acknowledgeable) return prev;
      const next = acknowledgeUncertainLocalLockReducer(prev, ref, uncertaintyId);
      if (!removeUncertainty({ key: objectKey, uncertaintyId })) return prev;
      const remaining = readLatestGuard(uncertaintyEntryPrefix, objectKey, Date.now());
      if (remaining) return replaceLock(next, remaining);
      const ordinary = readOrdinary(ordinaryEntryPrefix, objectKey, Date.now());
      return ordinary ? replaceLock(next, ordinary) : next;
    });
  }, [ordinaryEntryPrefix, removeUncertainty, uncertaintyEntryPrefix]);

  const releaseLocalLocksByActionStateId = useCallback((actionStateId: number) => {
    setLocalLocks((prev) => {
      const next = releaseLocalLocksByActionStateIdReducer(prev, actionStateId);
      const activeKeys = new Set(next.map((lock) => lock.key));
      for (const lock of prev) {
        if (!activeKeys.has(lock.key)) removeOrdinary(lock.key);
      }
      return next;
    });
  }, [removeOrdinary]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const interval = window.setInterval(() => {
      setLocalLocks((prev) => {
        const next = pruneLocalLocks(prev, Date.now());
        const activeKeys = new Set(next.map((lock) => lock.key));
        for (const lock of prev) {
          if (!activeKeys.has(lock.key)) removeOrdinary(lock.key);
        }
        return next;
      });
    }, 5_000);
    return () => window.clearInterval(interval);
  }, [removeOrdinary]);

  const isLocallyLocked = useCallback((ref: ObjectRef) => {
    const key = objectRefKey(ref);
    const now = Date.now();
    return localLocks.some((lock) => lock.key === key && isLocalLockActive(lock, now));
  }, [localLocks]);

  return {
    localLocks,
    acquireLocalLock,
    releaseLocalLock,
    settleLocalLock,
    acknowledgeUncertainLocalLock,
    releaseLocalLocksByActionStateId,
    isLocallyLocked,
  };
}
