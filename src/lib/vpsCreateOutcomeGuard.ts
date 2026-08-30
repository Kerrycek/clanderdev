import { LocalLockPersistenceError } from './localLocks';

const CREATE_OUTCOME_GUARD_PREFIX = 'webui-next.vps-create-outcome-uncertain';

export interface VpsCreateOutcomeMarker {
  id: string;
  createdAt: number;
  phase: 'pending' | 'uncertain' | 'accepted';
  identity?: {
    hostname: string;
    ownerId?: number;
    locationId?: number;
  };
  candidateVpsId?: number;
  actionStateId?: number;
}

function scopeKey(userId: number | undefined): string {
  return `${CREATE_OUTCOME_GUARD_PREFIX}.user-${userId ?? 'unknown'}`;
}

export function vpsCreateOutcomeEntryPrefix(userId: number | undefined): string {
  return `${scopeKey(userId)}.generation-`;
}

function entryKey(userId: number | undefined, markerId: string): string {
  return `${vpsCreateOutcomeEntryPrefix(userId)}${encodeURIComponent(markerId)}`;
}

function mutexName(userId: number | undefined): string {
  return `${scopeKey(userId)}.mutex`;
}

function newMarker(
  nowMs: number,
  identity?: VpsCreateOutcomeMarker['identity']
): VpsCreateOutcomeMarker {
  const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
  return { id: `${Math.floor(nowMs)}-${random}`, createdAt: Math.floor(nowMs), phase: 'pending', identity };
}

function parseMarker(raw: string | null): VpsCreateOutcomeMarker | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as {
      id?: unknown;
      createdAt?: unknown;
      phase?: unknown;
      identity?: unknown;
      candidateVpsId?: unknown;
      actionStateId?: unknown;
    };
    const createdAt = Number(value.createdAt);
    if (typeof value.id !== 'string' || !value.id || !Number.isFinite(createdAt) || createdAt <= 0) return null;
    if (value.phase !== 'pending' && value.phase !== 'uncertain' && value.phase !== 'accepted') return null;
    const identityValue = value.identity && typeof value.identity === 'object'
      ? value.identity as { hostname?: unknown; ownerId?: unknown; locationId?: unknown }
      : null;
    const hostname = typeof identityValue?.hostname === 'string' ? identityValue.hostname.trim() : '';
    const ownerId = Number(identityValue?.ownerId);
    const locationId = Number(identityValue?.locationId);
    const candidateVpsId = Number(value.candidateVpsId);
    const actionStateId = Number(value.actionStateId);
    return {
      id: value.id,
      createdAt: Math.floor(createdAt),
      phase: value.phase,
      identity: hostname ? {
        hostname,
        ...(Number.isInteger(ownerId) && ownerId > 0 ? { ownerId } : {}),
        ...(Number.isInteger(locationId) && locationId > 0 ? { locationId } : {}),
      } : undefined,
      candidateVpsId: Number.isInteger(candidateVpsId) && candidateVpsId > 0 ? candidateVpsId : undefined,
      actionStateId: Number.isInteger(actionStateId) && actionStateId > 0 ? actionStateId : undefined,
    };
  } catch {
    return null;
  }
}

export function readLatestVpsCreateOutcomeMarker(userId: number | undefined): VpsCreateOutcomeMarker | null {
  if (typeof window === 'undefined') return null;
  const prefix = vpsCreateOutcomeEntryPrefix(userId);
  let latest: VpsCreateOutcomeMarker | null = null;
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key?.startsWith(prefix)) continue;
    const marker = parseMarker(window.localStorage.getItem(key));
    if (!marker) {
      let id = 'corrupt-marker';
      try {
        id = decodeURIComponent(key.slice(prefix.length)) || id;
      } catch {
        // The opaque id is only used to keep the guard fail-closed.
      }
      return { id, createdAt: 1, phase: 'pending' };
    }
    if (!latest || marker.createdAt > latest.createdAt
      || (marker.createdAt === latest.createdAt && marker.id > latest.id)) latest = marker;
  }
  return latest;
}

function verifiedSetMarker(userId: number | undefined, marker: VpsCreateOutcomeMarker): boolean {
  if (typeof window === 'undefined') return false;
  const key = entryKey(userId, marker.id);
  const value = JSON.stringify(marker);
  try {
    window.localStorage.setItem(key, value);
    return window.localStorage.getItem(key) === value;
  } catch {
    return false;
  }
}

function verifiedRemoveMarker(userId: number | undefined, marker: VpsCreateOutcomeMarker): boolean {
  if (typeof window === 'undefined') return false;
  const key = entryKey(userId, marker.id);
  try {
    window.localStorage.removeItem(key);
    return window.localStorage.getItem(key) === null;
  } catch {
    return false;
  }
}

async function withCreateMutex<T>(
  userId: number | undefined,
  persistenceErrorMessage: string,
  callback: () => T | Promise<T>
): Promise<T> {
  if (typeof navigator === 'undefined' || typeof navigator.locks?.request !== 'function') {
    throw new LocalLockPersistenceError(persistenceErrorMessage);
  }
  return navigator.locks.request(mutexName(userId), callback);
}

export async function beginVpsCreateOutcomeGuard(args: {
  userId?: number;
  identity?: VpsCreateOutcomeMarker['identity'];
  persistenceErrorMessage: string;
  outcomeUncertainMessage: string;
}): Promise<VpsCreateOutcomeMarker> {
  return withCreateMutex(args.userId, args.persistenceErrorMessage, () => {
    if (readLatestVpsCreateOutcomeMarker(args.userId)) {
      throw new LocalLockPersistenceError(args.outcomeUncertainMessage);
    }
    const marker = newMarker(Date.now(), args.identity);
    if (!verifiedSetMarker(args.userId, marker)) {
      throw new LocalLockPersistenceError(args.persistenceErrorMessage);
    }
    return marker;
  });
}

export async function clearVpsCreateOutcomeMarker(args: {
  userId?: number;
  marker: VpsCreateOutcomeMarker;
  persistenceErrorMessage: string;
}): Promise<boolean> {
  return withCreateMutex(args.userId, args.persistenceErrorMessage, () => (
    verifiedRemoveMarker(args.userId, args.marker)
  ));
}

export async function markVpsCreateOutcomeUncertain(args: {
  userId?: number;
  marker: VpsCreateOutcomeMarker;
  candidateVpsId?: number;
  persistenceErrorMessage: string;
}): Promise<VpsCreateOutcomeMarker> {
  return withCreateMutex(args.userId, args.persistenceErrorMessage, () => {
    const marker = {
      ...args.marker,
      phase: 'uncertain' as const,
      candidateVpsId: Number.isInteger(args.candidateVpsId) && Number(args.candidateVpsId) > 0
        ? Number(args.candidateVpsId)
        : args.marker.candidateVpsId,
    };
    if (!verifiedSetMarker(args.userId, marker)) {
      // The durable pending marker is deliberately left in place. It remains
      // non-acknowledgeable and therefore safer than exposing a blind retry.
      throw new LocalLockPersistenceError(args.persistenceErrorMessage);
    }
    return marker;
  });
}

export async function markVpsCreateOutcomeAccepted(args: {
  userId?: number;
  marker: VpsCreateOutcomeMarker;
  candidateVpsId?: number;
  actionStateId: number;
  persistenceErrorMessage: string;
}): Promise<VpsCreateOutcomeMarker> {
  return withCreateMutex(args.userId, args.persistenceErrorMessage, () => {
    const marker = {
      ...args.marker,
      phase: 'accepted' as const,
      candidateVpsId: Number.isInteger(args.candidateVpsId) && Number(args.candidateVpsId) > 0
        ? Number(args.candidateVpsId)
        : args.marker.candidateVpsId,
      actionStateId: args.actionStateId,
    };
    if (!verifiedSetMarker(args.userId, marker)) {
      // Never remove the durable in-flight marker before the accepted receipt
      // has been verified. A reload must not make a duplicate create possible.
      throw new LocalLockPersistenceError(args.persistenceErrorMessage);
    }
    return marker;
  });
}
