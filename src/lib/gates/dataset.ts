import type { Dataset } from '../api/datasets';
import type { UserRole } from '../roles';
import type { GateDecision, GateReason } from './types';

export interface DatasetCapabilities {
  canCreateSubdataset: boolean;
  canDelete: boolean;
  canUpdate: boolean;
  canUseAdminProperties: boolean;
}

export interface DatasetCapabilityContext {
  role?: UserRole;
  scope: 'mine' | 'all';
  userId?: number;
}

export type DatasetAction =
  | 'dataset.create'
  | 'dataset.update'
  | 'dataset.delete'
  | 'snapshot.create'
  | 'snapshot.rollback'
  | 'snapshot.delete'
  | 'download.create'
  | 'download.delete';

type DatasetLife = 'active' | 'inactive' | 'deleted' | 'unknown';

function lifeState(ds: Dataset): DatasetLife {
  const st = String((ds as any).object_state ?? '').trim();
  if (st === 'active') return 'active';
  if (st === 'deleted') return 'deleted';
  if (st === 'inactive') return 'inactive';
  if (st) return 'unknown';

  const active = (ds as any).active;
  if (active === true) return 'active';
  if (active === false) return 'inactive';
  return 'active';
}

function blocksWhenInactive(action: DatasetAction): boolean {
  // Download deletion is independent and remains useful even if the dataset is deleted.
  return action !== 'download.delete';
}

function requiresAdmin(action: DatasetAction): boolean {
  switch (action) {
    case 'snapshot.rollback':
    case 'snapshot.delete':
    case 'download.delete':
      return true;
    case 'snapshot.create':
    case 'download.create':
      return false;
    default:
      return false;
  }
}

function resourceId(value: unknown): number | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const id = (value as { id?: unknown }).id;
  return typeof id === 'number' && Number.isFinite(id) ? id : undefined;
}

/**
 * Derive frontend capabilities without treating every mutation as an
 * administrator feature. The API scopes normal-user reads to their own
 * datasets and remains authoritative for the model-level user_create,
 * user_destroy and user_editable flags, which its current Dataset output does
 * not expose. Parent presence prevents offering root-dataset deletion.
 */
export function datasetCapabilities(
  dataset: Dataset,
  ctx: DatasetCapabilityContext
): DatasetCapabilities {
  const canUseAdminProperties = ctx.role === 'admin' && ctx.scope === 'all';
  if (canUseAdminProperties) {
    return {
      canCreateSubdataset: true,
      canDelete: true,
      canUpdate: true,
      canUseAdminProperties: true,
    };
  }

  const ownerId = resourceId(dataset.user);
  // Fail closed when ownership metadata is missing. Detail/list callers ask
  // the API for the user relation explicitly, so an absent owner is not a
  // reason to expose a mutation and let the request discover permissions.
  const ownedInMineScope =
    ctx.scope === 'mine' &&
    ownerId !== undefined &&
    ctx.userId !== undefined &&
    ownerId === ctx.userId;
  const isSubdataset = resourceId(dataset.parent) !== undefined;

  return {
    canCreateSubdataset: ownedInMineScope,
    // Root datasets back VPS/NAS objects and are not user-destroyable.
    canDelete: ownedInMineScope && isSubdataset,
    canUpdate: ownedInMineScope,
    canUseAdminProperties: false,
  };
}

function deny(reason: GateReason): GateDecision {
  return { allowed: false, reason };
}

export function gateDatasetAction(
  action: DatasetAction,
  ctx: {
    dataset: Dataset;
    busyTransaction?: boolean;
    busyLocal?: boolean;
    role?: UserRole;
    permission?: boolean;
  }
): GateDecision {
  if (ctx.permission === false) {
    return deny({ titleKey: 'gate.blocked.permission.title', descriptionKey: 'gate.blocked.permission.body' });
  }

  // Dataset create/delete are user capabilities on owned objects. Callers
  // must pass the object-scoped decision; keep the old fail-closed behavior
  // when they do not.
  if (
    ctx.permission === undefined &&
    ctx.role &&
    ctx.role !== 'admin' &&
    (action === 'dataset.create' || action === 'dataset.delete')
  ) {
    return deny({ titleKey: 'gate.blocked.permission.title', descriptionKey: 'gate.blocked.permission.body' });
  }

  if (ctx.role && ctx.role !== 'admin' && requiresAdmin(action)) {
    return deny({ titleKey: 'gate.admin_only.title', descriptionKey: 'gate.admin_only.body' });
  }

  if (ctx.busyTransaction) {
    return deny({ titleKey: 'gate.busy.transaction.title', descriptionKey: 'gate.busy.transaction.body' });
  }

  if (ctx.busyLocal) {
    return deny({ titleKey: 'gate.busy.local.title', descriptionKey: 'gate.busy.local.body' });
  }

  const life = lifeState(ctx.dataset);
  if (blocksWhenInactive(action)) {
    if (life === 'deleted') {
      return deny({
        titleKey: 'gate.blocked.dataset.deleted.title',
        descriptionKey: 'gate.blocked.dataset.deleted.body',
      });
    }

    if (life === 'inactive') {
      return deny({
        titleKey: 'gate.blocked.dataset.inactive.title',
        descriptionKey: 'gate.blocked.dataset.inactive.body',
      });
    }

    if (life !== 'active') {
      return deny({
        titleKey: 'gate.blocked.dataset.unknown_state.title',
        descriptionKey: 'gate.blocked.dataset.unknown_state.body',
      });
    }
  }

  return { allowed: true };
}
