import {
  createLocalLock,
  isLocalLockActive,
  normalizeLocalLock,
  parseLocalLocksFromStorage,
  pruneLocalLocks,
  type LocalLock,
} from '../../lib/localLocks';
import { parseObjectRefKey } from '../../lib/objectRef';

export const ordinaryPrefix = (scopeKey: string) => `${scopeKey}.entry.`;
export const uncertainPrefix = (scopeKey: string) => `${scopeKey}.uncertain.`;
export const ordinaryKey = (prefix: string, objectKey: string) => `${prefix}${encodeURIComponent(objectKey)}`;
export const generatedKey = (prefix: string, lock: Pick<LocalLock, 'key' | 'uncertaintyId'>) => (
  `${prefix}${encodeURIComponent(lock.key)}.${encodeURIComponent(lock.uncertaintyId ?? 'legacy')}`
);
export const generationLeaseName = (scopeKey: string, lock: Pick<LocalLock, 'key' | 'uncertaintyId'>) => (
  `${scopeKey}.generation.${encodeURIComponent(lock.key)}.${encodeURIComponent(lock.uncertaintyId ?? '')}`
);
export const LEASE_GENERATION_PREFIX = 'lease-v1-';

export async function promotePendingLockIfOrphan(
  lock: LocalLock,
  scopeKey: string,
  uncertaintyEntryPrefix: string
): Promise<LocalLock> {
  if (lock.pending !== true || !lock.uncertaintyId || typeof navigator.locks?.request !== 'function') return lock;
  // Only markers published under the lease protocol can be proven orphaned.
  // Legacy/unknown pending markers remain fail-closed for operator recovery.
  if (!lock.uncertaintyId.startsWith(LEASE_GENERATION_PREFIX)) return lock;
  return navigator.locks.request(generationLeaseName(scopeKey, lock), { ifAvailable: true }, (lease) => {
    if (!lease) return lock;
    const storageKey = generatedKey(uncertaintyEntryPrefix, lock);
    const persisted = inspectStoredLock(window.localStorage.getItem(storageKey), Date.now());
    if (persisted.status !== 'active'
      || persisted.lock?.pending !== true
      || persisted.lock.key !== lock.key
      || persisted.lock.uncertaintyId !== lock.uncertaintyId) return persisted.lock ?? lock;
    const uncertain = createLocalLock({ kind: lock.kind, id: lock.id }, persisted.lock.acquiredAt, {
      uncertain: true,
      uncertaintyId: lock.uncertaintyId,
      intent: persisted.lock.intent,
    });
    return verifiedSetItem(storageKey, JSON.stringify(uncertain)) ? uncertain : lock;
  });
}

export function newGenerationId(nowMs: number): string {
  const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
  return `${Math.floor(nowMs)}-${random}`;
}

type StoredLockInspection = {
  status: 'missing' | 'invalid' | 'expired' | 'active';
  lock?: LocalLock;
};

export function inspectStoredLock(raw: string | null, nowMs: number): StoredLockInspection {
  if (!raw) return { status: 'missing' };
  try {
    const lock = normalizeLocalLock(JSON.parse(raw));
    if (!lock) return { status: 'invalid' };
    return isLocalLockActive(lock, nowMs) ? { status: 'active', lock } : { status: 'expired', lock };
  } catch {
    return { status: 'invalid' };
  }
}

export function corruptStoredLock(storageKey: string, prefix: string, nowMs: number, generated: boolean): LocalLock | null {
  const suffix = storageKey.slice(prefix.length);
  const separator = suffix.indexOf('.');
  const encodedObjectKey = generated
    ? (separator > 0 ? suffix.slice(0, separator) : suffix)
    : suffix;
  if (!encodedObjectKey) return null;
  try {
    const ref = parseObjectRefKey(decodeURIComponent(encodedObjectKey));
    return ref
      ? createLocalLock(ref, nowMs, { pending: true, uncertaintyId: `corrupt-${encodeURIComponent(storageKey)}` })
      : null;
  } catch {
    return null;
  }
}

type UncertaintyEntryInspection = {
  lock: LocalLock | null;
  objectKey: string | null;
  corrupt: boolean;
};

function inspectUncertaintyEntry(
  storageKey: string,
  prefix: string,
  nowMs: number
): UncertaintyEntryInspection {
  const corrupt = corruptStoredLock(storageKey, prefix, nowMs, true);
  if (!corrupt) return { lock: null, objectKey: null, corrupt: false };

  const inspected = inspectStoredLock(window.localStorage.getItem(storageKey), nowMs);
  const lock = inspected.status === 'active' ? inspected.lock ?? null : null;
  const exactMarker = Boolean(
    lock
      && (lock.pending === true || lock.uncertain === true)
      && lock.key === corrupt.key
      && lock.uncertaintyId
      && generatedKey(prefix, lock) === storageKey
  );

  return exactMarker
    ? { lock, objectKey: lock!.key, corrupt: false }
    : { lock: corrupt, objectKey: corrupt.key, corrupt: true };
}

export const replaceLock = (locks: LocalLock[], lock: LocalLock) => (
  [lock, ...locks.filter((candidate) => candidate.key !== lock.key)]
);

function latestLock(existing: LocalLock | null, incoming: LocalLock): LocalLock {
  if (existing?.uncertain === true && incoming.uncertain !== true) return existing;
  if (existing?.uncertain === true && incoming.uncertain === true) {
    if (existing.acquiredAt > incoming.acquiredAt) return existing;
    if (existing.acquiredAt === incoming.acquiredAt
      && String(existing.uncertaintyId ?? '') > String(incoming.uncertaintyId ?? '')) return existing;
  }
  return incoming;
}

export function readLatestGuard(prefix: string, objectKey: string, nowMs: number): LocalLock | null {
  if (typeof window === 'undefined') return null;
  let latest: LocalLock | null = null;
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key?.startsWith(prefix)) continue;
    const entry = inspectUncertaintyEntry(key, prefix, nowMs);
    if (entry.objectKey !== objectKey || !entry.lock) continue;
    if (entry.corrupt) return entry.lock;
    latest = latestLock(latest, entry.lock);
  }
  return latest;
}

export function readOrdinary(prefix: string, objectKey: string, nowMs: number): LocalLock | null {
  if (typeof window === 'undefined') return null;
  const key = ordinaryKey(prefix, objectKey);
  const inspected = inspectStoredLock(window.localStorage.getItem(key), nowMs);
  if (inspected.status === 'active') return inspected.lock ?? null;
  if (inspected.status === 'expired') {
    verifiedRemoveItem(key);
    return null;
  }
  return inspected.status === 'invalid' ? corruptStoredLock(key, prefix, nowMs, false) : null;
}

export function readLocks(
  ordinaryEntryPrefix: string,
  uncertaintyEntryPrefix: string,
  legacyRaw: string | null,
  nowMs: number
): LocalLock[] {
  if (typeof window === 'undefined') return [];
  const byKey = new Map<string, LocalLock>();
  for (const lock of parseLocalLocksFromStorage(legacyRaw, nowMs)) byKey.set(lock.key, lock);
  const keys: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(ordinaryEntryPrefix) || key?.startsWith(uncertaintyEntryPrefix)) keys.push(key);
  }
  keys.sort((left, right) => Number(left.startsWith(uncertaintyEntryPrefix)) - Number(right.startsWith(uncertaintyEntryPrefix)));
  const corruptGuardKeys = new Set<string>();
  for (const key of keys) {
    if (key.startsWith(uncertaintyEntryPrefix)) {
      const entry = inspectUncertaintyEntry(key, uncertaintyEntryPrefix, nowMs);
      if (!entry.lock || !entry.objectKey) continue;
      if (entry.corrupt) {
        corruptGuardKeys.add(entry.objectKey);
        byKey.set(entry.objectKey, entry.lock);
      } else if (!corruptGuardKeys.has(entry.objectKey)) {
        byKey.set(entry.objectKey, latestLock(byKey.get(entry.objectKey) ?? null, entry.lock));
      }
      continue;
    }
    const inspected = inspectStoredLock(window.localStorage.getItem(key), nowMs);
    if (inspected.status === 'expired') {
      verifiedRemoveItem(key);
      continue;
    }
    const guarded = inspected.status === 'active'
      ? inspected.lock ?? null
      : inspected.status === 'invalid'
        ? corruptStoredLock(key, ordinaryEntryPrefix, nowMs, false)
        : null;
    if (!guarded) continue;
    byKey.set(guarded.key, latestLock(byKey.get(guarded.key) ?? null, guarded));
  }
  return pruneLocalLocks([...byKey.values()], nowMs);
}

export function verifiedSetItem(key: string, value: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(key, value);
    return window.localStorage.getItem(key) === value;
  } catch {
    return false;
  }
}

export function verifiedRemoveItem(key: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.removeItem(key);
    return window.localStorage.getItem(key) === null;
  } catch {
    return false;
  }
}
