import { normalizeObjectRef, objectRefKey, type ObjectRef } from './objectRef';

export type LocalMutationIntent =
  | {
    type: 'dataset-snapshot-rollback';
    snapshotId: number;
    baselineTransactionChainId: number;
  }
  | {
    type: 'ip-route-assign';
    previousNetworkInterfaceId: null;
    expectedNetworkInterfaceId: number;
    expectedVpsId: number;
  }
  | {
    type: 'ip-route-free';
    previousNetworkInterfaceId: number;
    expectedNetworkInterfaceId: null;
  }
  | {
    type: 'ip-owner-update';
    previousUserId: number | null;
    previousEnvironmentId: number | null;
    expectedUserId: number | null;
    expectedEnvironmentId: number | null;
  };

declare const localMutationGenerationBrand: unique symbol;

/**
 * Opaque capability for one exact durable mutation request.
 *
 * Callers may only receive this value from a successful durable acquire and
 * must pass the same object back when binding or settling that request. The
 * private brand prevents application code from constructing a valid handle;
 * the lock manager additionally verifies object identity at runtime.
 */
export interface LocalMutationGeneration {
  readonly [localMutationGenerationBrand]: true;
}

export interface LocalMutationLockOptions {
  actionStateId?: number;
  ttlMs?: number;
  uncertain?: boolean;
  pending?: boolean;
  uncertaintyId?: string;
  intent?: LocalMutationIntent;
  generation?: LocalMutationGeneration;
}

export interface AcquireLocalMutationLock {
  (ref: ObjectRef, opts: LocalMutationLockOptions & { durable: true }): Promise<LocalMutationGeneration>;
  (ref: ObjectRef, opts?: LocalMutationLockOptions & { durable?: false | undefined }): void;
}

export interface LocalLock {
  /** Stable object key: `${kind}:${id}` */
  key: string;
  kind: ObjectRef['kind'];
  id: number;

  /** When the lock was first acquired (epoch ms). */
  acquiredAt: number;

  /** When the lock expires if not released earlier (epoch ms). */
  expiresAt: number;

  /** Optional backend action_state_id that this lock is bound to. */
  actionStateId?: number;

  /**
   * The API accepted a blocking mutation but did not return its task id.
   *
   * This is deliberately non-expiring: the outcome is ambiguous and a blind
   * retry could duplicate or repeat a destructive operation. It may only be
   * cleared by an explicit reconciliation/acknowledgement in the UI.
   */
  uncertain?: boolean;

  /**
   * A blocking request is currently in flight. Like an uncertain outcome this
   * marker is durable and non-expiring, but it cannot be acknowledged by the
   * user. It is transitioned to `uncertain` only after an ambiguous settle.
   */
  pending?: boolean;

  /** Unique generation of the persisted uncertainty marker. */
  uncertaintyId?: string;

  /** Strict, allowlisted proof target used when reconciling an ambiguous mutation. */
  intent?: LocalMutationIntent;
}

export const LOCAL_LOCK_STORAGE_KEY = 'webui-next.local_locks';

export const LOCAL_LOCK_PERSISTENCE_ERROR_CODE = 'LOCAL_LOCK_PERSISTENCE_FAILED' as const;

export class LocalLockPersistenceError extends Error {
  public readonly code = LOCAL_LOCK_PERSISTENCE_ERROR_CODE;

  constructor(message: string) {
    super(message);
    this.name = 'LocalLockPersistenceError';
  }
}

export function isLocalLockPersistenceError(error: unknown): error is LocalLockPersistenceError {
  return error instanceof LocalLockPersistenceError
    || (Boolean(error)
      && typeof error === 'object'
      && (error as { code?: unknown }).code === LOCAL_LOCK_PERSISTENCE_ERROR_CODE);
}

// Default TTLs
export const LOCAL_LOCK_TTL_UNBOUND_MS = 60_000;
export const LOCAL_LOCK_TTL_BOUND_MS = 6 * 60 * 60 * 1000;

function capLocalLocks(locks: LocalLock[]): LocalLock[] {
  const uncertain = locks.filter((lock) => lock.uncertain === true || lock.pending === true);
  const ordinary = locks.filter((lock) => lock.uncertain !== true && lock.pending !== true);
  // Safety takes precedence over the ordinary cache bound. Never evict an
  // ambiguous outcome merely because many other objects were touched.
  return [...uncertain, ...ordinary.slice(0, Math.max(0, 200 - uncertain.length))];
}

export function isLocalLockActive(lock: LocalLock, nowMs: number): boolean {
  return lock.uncertain === true || lock.pending === true || Number(lock.expiresAt) > nowMs;
}

export function normalizeActionStateId(raw: unknown): number | undefined {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.floor(n);
}

export function normalizeEpochMs(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

function isNullablePositiveId(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isInteger(value) && value > 0);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function hasExactKeys(value: Record<string, unknown>, expected: string[]): boolean {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length
    && keys.every((key, index) => key === [...expected].sort()[index]);
}

export function normalizeLocalMutationIntent(raw: unknown): LocalMutationIntent | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;

  if (value['type'] === 'dataset-snapshot-rollback') {
    if (!hasExactKeys(value, ['type', 'snapshotId', 'baselineTransactionChainId'])) return null;
    if (!isNonNegativeInteger(value['snapshotId'])
      || value['snapshotId'] === 0
      || !isNonNegativeInteger(value['baselineTransactionChainId'])) return null;
    return {
      type: value['type'],
      snapshotId: value['snapshotId'],
      baselineTransactionChainId: value['baselineTransactionChainId'],
    };
  }

  if (value['type'] === 'ip-route-assign') {
    if (!hasExactKeys(value, [
      'type',
      'previousNetworkInterfaceId',
      'expectedNetworkInterfaceId',
      'expectedVpsId',
    ])) return null;
    if (value['previousNetworkInterfaceId'] !== null
      || !isNullablePositiveId(value['expectedNetworkInterfaceId'])
      || value['expectedNetworkInterfaceId'] === null
      || !isNullablePositiveId(value['expectedVpsId'])
      || value['expectedVpsId'] === null) return null;
    return {
      type: value['type'],
      previousNetworkInterfaceId: null,
      expectedNetworkInterfaceId: value['expectedNetworkInterfaceId'],
      expectedVpsId: value['expectedVpsId'],
    };
  }

  if (value['type'] === 'ip-route-free') {
    if (!hasExactKeys(value, [
      'type',
      'previousNetworkInterfaceId',
      'expectedNetworkInterfaceId',
    ])) return null;
    if (!isNullablePositiveId(value['previousNetworkInterfaceId'])
      || value['previousNetworkInterfaceId'] === null
      || value['expectedNetworkInterfaceId'] !== null) return null;
    return {
      type: value['type'],
      previousNetworkInterfaceId: value['previousNetworkInterfaceId'],
      expectedNetworkInterfaceId: null,
    };
  }

  if (value['type'] === 'ip-owner-update') {
    if (!hasExactKeys(value, [
      'type',
      'previousUserId',
      'previousEnvironmentId',
      'expectedUserId',
      'expectedEnvironmentId',
    ])) return null;
    if (!isNullablePositiveId(value['previousUserId'])
      || !isNullablePositiveId(value['previousEnvironmentId'])
      || !isNullablePositiveId(value['expectedUserId'])
      || !isNullablePositiveId(value['expectedEnvironmentId'])
      || (value['expectedUserId'] === null && value['expectedEnvironmentId'] !== null)
      || (value['expectedUserId'] !== null && value['expectedEnvironmentId'] === null)
      || (value['previousUserId'] === value['expectedUserId']
        && value['previousEnvironmentId'] === value['expectedEnvironmentId'])) return null;
    return {
      type: value['type'],
      previousUserId: value['previousUserId'],
      previousEnvironmentId: value['previousEnvironmentId'],
      expectedUserId: value['expectedUserId'],
      expectedEnvironmentId: value['expectedEnvironmentId'],
    };
  }

  return null;
}

export function createLocalLock(
  ref: ObjectRef,
  nowMs: number,
  opts?: {
    actionStateId?: number;
    ttlMs?: number;
    uncertain?: boolean;
    pending?: boolean;
    uncertaintyId?: string;
    intent?: LocalMutationIntent;
  }
): LocalLock {
  const actionStateId = normalizeActionStateId(opts?.actionStateId);
  const uncertain = actionStateId === undefined && opts?.uncertain === true;
  const pending = actionStateId === undefined && !uncertain && opts?.pending === true;
  const ttl =
    typeof opts?.ttlMs === 'number' && Number.isFinite(opts.ttlMs) && opts.ttlMs > 0
      ? Math.floor(opts.ttlMs)
      : actionStateId
        ? LOCAL_LOCK_TTL_BOUND_MS
        : LOCAL_LOCK_TTL_UNBOUND_MS;

  return {
    key: objectRefKey(ref),
    kind: ref.kind,
    id: ref.id,
    acquiredAt: Math.floor(nowMs),
    expiresAt: uncertain || pending ? Number.MAX_SAFE_INTEGER : Math.floor(nowMs) + ttl,
    actionStateId,
    uncertain: uncertain || undefined,
    pending: pending || undefined,
    uncertaintyId: opts?.uncertaintyId,
    intent: opts?.intent,
  };
}

export function normalizeLocalLock(raw: unknown): LocalLock | null {
  if (!raw || typeof raw !== 'object') return null;
  const anyRaw = raw as any;

  // We accept either:
  // - { key: 'Kind:123', acquiredAt, expiresAt, actionStateId }
  // - { kind: 'Kind', id: 123, acquiredAt, expiresAt, actionStateId }
  // - { ref: { kind, id }, ... }
  const ref = normalizeObjectRef(anyRaw.ref ?? anyRaw);
  if (!ref) return null;

  const acquiredAt = normalizeEpochMs(anyRaw.acquiredAt ?? anyRaw.acquired_at);
  const expiresAt = normalizeEpochMs(anyRaw.expiresAt ?? anyRaw.expires_at);
  if (acquiredAt === null || expiresAt === null) return null;

  const actionStateId = normalizeActionStateId(anyRaw.actionStateId ?? anyRaw.action_state_id);
  const uncertain = actionStateId === undefined && anyRaw.uncertain === true;
  const pending = actionStateId === undefined && !uncertain && anyRaw.pending === true;
  const uncertaintyId = typeof anyRaw.uncertaintyId === 'string' && anyRaw.uncertaintyId
    ? anyRaw.uncertaintyId
    : undefined;
  const hasIntent = Object.prototype.hasOwnProperty.call(anyRaw, 'intent');
  const normalizedIntent = hasIntent ? normalizeLocalMutationIntent(anyRaw.intent) : null;
  const expectedIntentKind = normalizedIntent?.type === 'dataset-snapshot-rollback' ? 'Dataset' : 'IpAddress';
  if (hasIntent && (!normalizedIntent || ref.kind !== expectedIntentKind)) return null;
  const intent = normalizedIntent ?? undefined;

  return {
    key: objectRefKey(ref),
    kind: ref.kind,
    id: ref.id,
    acquiredAt,
    expiresAt,
    actionStateId,
    uncertain: uncertain || undefined,
    pending: pending || undefined,
    uncertaintyId,
    intent,
  };
}

export function parseLocalLocksFromStorage(rawJson: string | null, nowMs: number): LocalLock[] {
  if (!rawJson) return [];
  try {
    const parsed = JSON.parse(rawJson);
    if (!Array.isArray(parsed)) return [];
    return pruneLocalLocks(parsed.map(normalizeLocalLock).filter(Boolean) as LocalLock[], nowMs);
  } catch {
    return [];
  }
}

export function pruneLocalLocks(locks: LocalLock[], nowMs: number): LocalLock[] {
  const seen = new Set<string>();
  const out: LocalLock[] = [];

  for (const l of locks) {
    if (!l) continue;
    if (!isLocalLockActive(l, nowMs)) continue;
    if (!l.key || typeof l.key !== 'string') continue;
    if (seen.has(l.key)) continue;
    seen.add(l.key);
    out.push(l);
  }

  return out;
}

export function upsertLocalLock(
  locks: LocalLock[],
  ref: ObjectRef,
  nowMs: number,
  opts?: {
    actionStateId?: number;
    ttlMs?: number;
    uncertain?: boolean;
    pending?: boolean;
    uncertaintyId?: string;
    intent?: LocalMutationIntent;
  }
): LocalLock[] {
  const key = objectRefKey(ref);
  const existing = locks.find((l) => l.key === key);

  const incomingAsId = normalizeActionStateId(opts?.actionStateId);

  if (!existing) {
    return capLocalLocks([
      createLocalLock(ref, nowMs, {
        actionStateId: incomingAsId,
        ttlMs: opts?.ttlMs,
        uncertain: opts?.uncertain,
        pending: opts?.pending,
        uncertaintyId: opts?.uncertaintyId,
        intent: opts?.intent,
      }),
      ...locks,
    ]);
  }

  const nextAsId = incomingAsId ?? existing.actionStateId;
  const nextUncertain = nextAsId === undefined && (opts?.uncertain === true || existing.uncertain === true);
  const nextPending = nextAsId === undefined && !nextUncertain && (opts?.pending === true || existing.pending === true);

  const ttl =
    typeof opts?.ttlMs === 'number' && Number.isFinite(opts.ttlMs) && opts.ttlMs > 0
      ? Math.floor(opts.ttlMs)
      : nextAsId
        ? LOCAL_LOCK_TTL_BOUND_MS
        : LOCAL_LOCK_TTL_UNBOUND_MS;

  const next: LocalLock = {
    ...existing,
    key,
    kind: ref.kind,
    id: ref.id,
    actionStateId: nextAsId,
    uncertain: nextUncertain || undefined,
    pending: nextPending || undefined,
    uncertaintyId: opts?.uncertaintyId ?? existing.uncertaintyId,
    intent: opts?.intent ?? existing.intent,
    // Preserve the original acquiredAt, but refresh expiry.
    expiresAt: nextUncertain || nextPending
      ? Number.MAX_SAFE_INTEGER
      : Math.max(existing.expiresAt, Math.floor(nowMs) + ttl),
  };

  return capLocalLocks([next, ...locks.filter((l) => l.key !== key)]);
}

/**
 * Release an unbound lock for the object (if present).
 *
 * Bound locks (actionStateId) are not released by this function.
 */
export function releaseLocalLock(locks: LocalLock[], ref: ObjectRef): LocalLock[] {
  const key = objectRefKey(ref);
  return locks.filter(
    (l) => !(l.key === key && l.actionStateId === undefined && l.uncertain !== true && l.pending !== true)
  );
}

/** Clear an ambiguous lock only after an explicit UI acknowledgement. */
export function acknowledgeUncertainLocalLock(
  locks: LocalLock[],
  ref: ObjectRef,
  uncertaintyId?: string
): LocalLock[] {
  const key = objectRefKey(ref);
  return locks.filter(
    (l) => !(l.key === key && l.uncertain === true && (uncertaintyId === undefined || l.uncertaintyId === uncertaintyId))
  );
}

/** Internal completion of one exact durable request generation. */
export function releaseDurableLocalLockGeneration(
  locks: LocalLock[],
  ref: ObjectRef,
  uncertaintyId: string
): LocalLock[] {
  const key = objectRefKey(ref);
  return locks.filter(
    (lock) => !(lock.key === key && lock.uncertaintyId === uncertaintyId
      && (lock.pending === true || lock.uncertain === true))
  );
}

export function releaseLocalLocksByActionStateId(locks: LocalLock[], actionStateId: number): LocalLock[] {
  const asId = normalizeActionStateId(actionStateId);
  if (asId === undefined) return locks;
  return locks.filter((l) => l.actionStateId !== asId);
}

export function localLockActionStateIds(locks: LocalLock[]): number[] {
  const out: number[] = [];
  const seen = new Set<number>();

  for (const l of locks) {
    const id = normalizeActionStateId(l.actionStateId);
    if (id === undefined) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= 40) break;
  }

  return out;
}
