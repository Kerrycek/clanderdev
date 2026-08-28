import type { ResourceRef, User, Vps } from './app';
import type { ExportItem } from './exports';
import { expectArray, HaveApiError, haveApiCall } from './haveapi';
import { fetchAllOutageEntities, fetchAllOutageHandlers } from './outageScopePaging';
import {
  type Outage,
  type OutageEntity,
  type OutageHandler,
  type OutageUpdate,
} from './public';

export type OutageAdminState = 'staged' | 'announced' | 'cancelled' | 'resolved';
export { fetchAllOutageEntities, fetchAllOutageHandlers, OutageScopeReadError } from './outageScopePaging';
export type OutageAdminType = 'planned_outage' | 'unplanned_outage';
export type OutageImpact =
  | 'tbd'
  | 'performance'
  | 'network'
  | 'system_restart'
  | 'system_reset'
  | 'unavailability'
  | 'export';

export interface OutageFilters {
  limit?: number;
  fromId?: number;
  type?: string;
  state?: string;
  impact?: string;
  affected?: boolean;
  user?: number;
  handledBy?: number;
  vps?: number;
  exportId?: number;
  environment?: number;
  location?: number;
  node?: number;
  vpsadmin?: number;
  entityName?: string;
  entityId?: number;
  order?: string;
}

export interface OutagePayload {
  begins_at?: string | null;
  finished_at?: string | null;
  duration?: number | null;
  type?: OutageAdminType;
  impact?: string;
  state?: string;
  auto_resolve?: boolean;
  en_summary?: string;
  en_description?: string;
  cs_summary?: string;
  cs_description?: string;
}

export interface OutageSystemsPayload {
  entities: Array<{ name: string; entity_id?: number | null }>;
  handlers: number[];
}

export interface OutageComponent {
  id: number;
  name?: string;
  label?: string;
  description?: string;
  [k: string]: unknown;
}

export interface OutageUpdatePayload {
  outage: number;
  send_mail?: boolean;
  begins_at?: string | null;
  finished_at?: string | null;
  duration?: number | null;
  impact?: string;
  state?: string;
  en_summary?: string;
  en_description?: string;
  cs_summary?: string;
  cs_description?: string;
}

export function outageStateTransitionPayload(
  outageId: number,
  state: OutageAdminState,
  sendMail = true
): OutageUpdatePayload {
  return {
    outage: outageId,
    state,
    send_mail: sendMail,
  };
}

export interface OutageAffectedUser {
  id: number;
  user?: User | ResourceRef;
  vps_count?: number;
  export_count?: number;
  [k: string]: unknown;
}

export interface OutageAffectedVps {
  id: number;
  outage?: Outage | ResourceRef;
  vps?: Vps | ResourceRef;
  direct?: boolean;
  user?: User | ResourceRef;
  environment?: ResourceRef;
  location?: ResourceRef;
  node?: ResourceRef;
  [k: string]: unknown;
}

export interface OutageAffectedExport {
  id: number;
  outage?: Outage | ResourceRef;
  export?: ExportItem | ResourceRef;
  user?: User | ResourceRef;
  environment?: ResourceRef;
  location?: ResourceRef;
  node?: ResourceRef;
  [k: string]: unknown;
}

/**
 * Outage scope is exposed by HaveAPI as separate entity/handler CRUD calls.
 * There is no bulk or transactional endpoint in either the deployed v4.1 API
 * or current upstream. This error reports whether the client managed to
 * reconcile the scope back to the exact state it received before the change.
 */
export class OutageSystemsApplyError extends Error {
  readonly outageId: number;
  readonly rollbackSucceeded: boolean;
  readonly originalError: unknown;
  readonly rollbackError?: unknown;

  constructor(opts: {
    outageId: number;
    rollbackSucceeded: boolean;
    originalError: unknown;
    rollbackError?: unknown;
  }) {
    super(opts.rollbackSucceeded
      ? `Affected scope for outage #${opts.outageId} was not saved; the previous scope was restored.`
      : `Affected scope for outage #${opts.outageId} may be partially saved; reload the outage before retrying.`);
    this.name = 'OutageSystemsApplyError';
    this.outageId = opts.outageId;
    this.rollbackSucceeded = opts.rollbackSucceeded;
    this.originalError = opts.originalError;
    this.rollbackError = opts.rollbackError;
  }
}

/**
 * The API has no endpoint for deleting a newly staged outage. If its initial
 * scope fails, keep the staged report and direct the administrator to its
 * detail instead of allowing an unsafe retry that would create a duplicate.
 */
export class OutageCreateWithSystemsError extends Error {
  readonly outageId: number;
  readonly rollbackSucceeded: boolean;
  readonly systemsError: OutageSystemsApplyError;

  constructor(outageId: number, systemsError: OutageSystemsApplyError) {
    super(systemsError.rollbackSucceeded
      ? `Outage #${outageId} was created without its affected scope; open the staged report and retry the scope change.`
      : `Outage #${outageId} was created, but its affected scope may be partially saved; reload the staged report before retrying.`);
    this.name = 'OutageCreateWithSystemsError';
    this.outageId = outageId;
    this.rollbackSucceeded = systemsError.rollbackSucceeded;
    this.systemsError = systemsError;
  }
}

/**
 * A transport/server failure while creating the root report is ambiguous: the
 * API can commit the POST and lose its response, and it has no idempotency key.
 * Callers must refresh the outage list before offering another create attempt.
 */
export class OutageCreateIndeterminateError extends Error {
  readonly originalError: unknown;

  constructor(originalError: unknown) {
    super('The outage create result is unknown; refresh and verify the outage list before retrying.');
    this.name = 'OutageCreateIndeterminateError';
    this.originalError = originalError;
  }
}

function outageListParams(opts?: OutageFilters): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  if (opts?.limit !== undefined) params['limit'] = opts.limit;
  if (opts?.fromId !== undefined) params['from_id'] = opts.fromId;
  if (opts?.type) params['type'] = opts.type;
  if (opts?.state) params['state'] = opts.state;
  if (opts?.impact) params['impact'] = opts.impact;
  if (opts?.affected !== undefined) params['affected'] = opts.affected;
  if (opts?.user !== undefined) params['user'] = opts.user;
  if (opts?.handledBy !== undefined) params['handled_by'] = opts.handledBy;
  if (opts?.vps !== undefined) params['vps'] = opts.vps;
  if (opts?.exportId !== undefined) params['export'] = opts.exportId;
  if (opts?.environment !== undefined) params['environment'] = opts.environment;
  if (opts?.location !== undefined) params['location'] = opts.location;
  if (opts?.node !== undefined) params['node'] = opts.node;
  if (opts?.vpsadmin !== undefined) params['vpsadmin'] = opts.vpsadmin;
  if (opts?.entityName) params['entity_name'] = opts.entityName;
  if (opts?.entityId !== undefined) params['entity_id'] = opts.entityId;
  if (opts?.order) params['order'] = opts.order;
  return params;
}

export async function fetchAdminOutages(opts?: OutageFilters) {
  const res = await haveApiCall<Outage[]>({
    method: 'GET',
    path: '/outages',
    namespace: 'outage',
    params: outageListParams(opts),
  });
  return { ...res, data: expectArray<Outage>(res.data, 'outages#index') };
}

export async function fetchOutageComponents(opts?: { limit?: number; fromId?: number }) {
  const params: Record<string, unknown> = {};
  if (opts?.limit !== undefined) params['limit'] = opts.limit;
  if (opts?.fromId !== undefined) params['from_id'] = opts.fromId;

  const res = await haveApiCall<OutageComponent[]>({
    method: 'GET',
    path: '/components',
    namespace: 'component',
    params,
  });
  return { ...res, data: expectArray<OutageComponent>(res.data, 'components#index') };
}

export async function createOutage(params: OutagePayload) {
  return haveApiCall<Outage>({
    method: 'POST',
    path: '/outages',
    namespace: 'outage',
    params: { ...params },
  });
}

export async function createOutageWithSystems(params: OutagePayload, systems: OutageSystemsPayload) {
  let res: Awaited<ReturnType<typeof createOutage>>;
  try {
    res = await createOutage(params);
  } catch (error) {
    const isDefinitiveApiRejection = error instanceof HaveApiError
      && (error.httpStatus === undefined || error.httpStatus < 500);
    if (isDefinitiveApiRejection) throw error;
    throw new OutageCreateIndeterminateError(error);
  }
  const outageId = res.data.id;
  try {
    await applyOutageSystems(outageId, systems);
  } catch (error) {
    if (error instanceof OutageSystemsApplyError) {
      throw new OutageCreateWithSystemsError(outageId, error);
    }
    throw error;
  }
  return res;
}

export async function updateOutage(outageId: number, params: OutagePayload) {
  return haveApiCall<Outage>({
    method: 'PUT',
    path: `/outages/${outageId}`,
    namespace: 'outage',
    params: { ...params },
  });
}

export async function rebuildOutageAffectedVps(outageId: number) {
  return haveApiCall<Outage>({
    method: 'POST',
    path: `/outages/${outageId}/rebuild_affected_vps`,
  });
}

export async function createOutageUpdate(params: OutageUpdatePayload) {
  return haveApiCall<OutageUpdate>({
    method: 'POST',
    path: '/outage_updates',
    namespace: 'outage_update',
    params: { ...params },
  });
}

export async function createOutageEntity(outageId: number, params: { name: string; entity_id?: number | null }) {
  return haveApiCall<OutageEntity>({
    method: 'POST',
    path: `/outages/${outageId}/entities`,
    namespace: 'entity',
    params,
  });
}

export async function deleteOutageEntity(outageId: number, entityId: number) {
  return haveApiCall<null>({
    method: 'DELETE',
    path: `/outages/${outageId}/entities/${entityId}`,
  });
}

export async function createOutageHandler(outageId: number, params: { user: number }) {
  return haveApiCall<OutageHandler>({
    method: 'POST',
    path: `/outages/${outageId}/handlers`,
    namespace: 'handler',
    params,
  });
}

export async function deleteOutageHandler(outageId: number, handlerId: number) {
  return haveApiCall<null>({
    method: 'DELETE',
    path: `/outages/${outageId}/handlers/${handlerId}`,
  });
}

export function outageHandlerUserId(h: OutageHandler): number | null {
  const raw = (h as any).user_id ?? (h as any).user?.id;
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

function outageEntityKey(name: string, entityId: number | null | undefined): string {
  return `${name}:${entityId ?? ''}`;
}

function currentOutageSystems(
  entities: OutageEntity[],
  handlers: OutageHandler[]
): OutageSystemsPayload {
  return {
    entities: entities.map((entity) => ({
      name: entity.name,
      entity_id: entity.entity_id ?? null,
    })),
    handlers: handlers
      .map(outageHandlerUserId)
      .filter((value): value is number => value !== null),
  };
}

async function applyOutageSystemsUnsafe(
  outageId: number,
  currentEntities: OutageEntity[],
  currentHandlers: OutageHandler[],
  wanted: OutageSystemsPayload
) {
  const wantedEntities = wanted.entities;
  const wantedKeys = new Set(wantedEntities.map((entity) => outageEntityKey(entity.name, entity.entity_id)));
  const currentKeys = new Set(currentEntities.map((entity) => outageEntityKey(entity.name, entity.entity_id)));

  for (const entity of wantedEntities) {
    if (!currentKeys.has(outageEntityKey(entity.name, entity.entity_id))) {
      await createOutageEntity(outageId, {
        name: entity.name,
        entity_id: entity.entity_id ?? null,
      });
    }
  }

  const wantedHandlers = new Set(wanted.handlers);
  const currentHandlerIds = new Set(
    currentHandlers
      .map(outageHandlerUserId)
      .filter((value): value is number => value !== null)
  );

  for (const user of wantedHandlers) {
    if (!currentHandlerIds.has(user)) await createOutageHandler(outageId, { user });
  }

  for (const entity of currentEntities) {
    if (!wantedKeys.has(outageEntityKey(entity.name, entity.entity_id))) {
      await deleteOutageEntity(outageId, entity.id);
    }
  }

  for (const handler of currentHandlers) {
    const user = outageHandlerUserId(handler);
    if (user !== null && !wantedHandlers.has(user)) {
      await deleteOutageHandler(outageId, handler.id);
    }
  }

  await rebuildOutageAffectedVps(outageId);
}

export async function applyOutageSystems(
  outageId: number,
  wanted: OutageSystemsPayload
) {
  // Never mutate from a possibly truncated snapshot supplied by the UI. Both
  // nested indexes are keyset-paginated, so obtain a verified complete scope
  // first. If this fails or hits a safety cap, no writes are attempted.
  const [currentEntities, currentHandlers] = await Promise.all([
    fetchAllOutageEntities(outageId),
    fetchAllOutageHandlers(outageId),
  ]);
  const original = currentOutageSystems(currentEntities, currentHandlers);

  try {
    await applyOutageSystemsUnsafe(
      outageId,
      currentEntities,
      currentHandlers,
      wanted
    );
  } catch (originalError) {
    try {
      // A failed HTTP request is ambiguous: the server can commit a write and
      // lose the response. Re-read the actual state before compensating.
      const [actualEntities, actualHandlers] = await Promise.all([
        fetchAllOutageEntities(outageId),
        fetchAllOutageHandlers(outageId),
      ]);
      await applyOutageSystemsUnsafe(
        outageId,
        actualEntities,
        actualHandlers,
        original
      );
      throw new OutageSystemsApplyError({
        outageId,
        rollbackSucceeded: true,
        originalError,
      });
    } catch (rollbackError) {
      if (rollbackError instanceof OutageSystemsApplyError) throw rollbackError;
      throw new OutageSystemsApplyError({
        outageId,
        rollbackSucceeded: false,
        originalError,
        rollbackError,
      });
    }
  }
}

export async function fetchUserOutages(outageId: number) {
  const res = await haveApiCall<OutageAffectedUser[]>({
    method: 'GET',
    path: '/user_outages',
    namespace: 'user_outage',
    params: { outage: outageId },
    meta: { includes: 'user' },
  });
  return { ...res, data: expectArray<OutageAffectedUser>(res.data, 'user_outages#index') };
}

export async function fetchVpsOutages(outageId: number) {
  const res = await haveApiCall<OutageAffectedVps[]>({
    method: 'GET',
    path: '/vps_outages',
    namespace: 'vps_outage',
    params: { outage: outageId },
    meta: { includes: 'vps,user,environment,location,node' },
  });
  return { ...res, data: expectArray<OutageAffectedVps>(res.data, 'vps_outages#index') };
}

export async function fetchExportOutages(outageId: number) {
  const res = await haveApiCall<OutageAffectedExport[]>({
    method: 'GET',
    path: '/export_outages',
    namespace: 'export_outage',
    params: { outage: outageId },
    meta: { includes: 'export,user,environment,location,node' },
  });
  return { ...res, data: expectArray<OutageAffectedExport>(res.data, 'export_outages#index') };
}
