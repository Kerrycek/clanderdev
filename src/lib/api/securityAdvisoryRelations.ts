import type { ResourceRef } from './appTypes';
import { expectArray, haveApiCall } from './haveapi';

export type SecurityAdvisoryNodeState =
  | 'unknown'
  | 'not_affected'
  | 'vulnerable'
  | 'mitigated'
  | string;

export interface SecurityAdvisoryNodeStatus {
  id: number;
  security_advisory?: ResourceRef | number;
  security_advisory_id?: number;
  node?: ResourceRef | number;
  node_id?: number;
  node_name?: string;
  state?: SecurityAdvisoryNodeState;
  vulnerable_until?: string | null;
  mitigated_since?: string | null;
  note?: string | null;
  [k: string]: unknown;
}

export interface SecurityAdvisoryNodeStatusCreatePayload {
  node: number;
  state: SecurityAdvisoryNodeState;
  vulnerable_until?: string | null;
  mitigated_since?: string | null;
  note?: string | null;
}

export type SecurityAdvisoryNodeStatusUpdatePayload = Partial<
  Pick<SecurityAdvisoryNodeStatusCreatePayload, 'state' | 'vulnerable_until' | 'mitigated_since' | 'note'>
>;

export interface SecurityAdvisoryAffectedUser {
  id: number;
  security_advisory?: ResourceRef | number;
  security_advisory_id?: number;
  user?: ResourceRef | number;
  user_id?: number;
  vps_count?: number;
  [k: string]: unknown;
}

export interface SecurityAdvisoryAffectedVps {
  id: number;
  security_advisory?: ResourceRef | number;
  security_advisory_id?: number;
  vps?: ResourceRef | number;
  vps_id?: number;
  user?: ResourceRef | number;
  user_id?: number;
  environment?: ResourceRef | number;
  environment_id?: number;
  location?: ResourceRef | number;
  location_id?: number;
  node?: ResourceRef | number;
  node_id?: number;
  node_state?: SecurityAdvisoryNodeState;
  vulnerable_until?: string | null;
  mitigated_since?: string | null;
  [k: string]: unknown;
}

export interface SecurityAdvisoryOutageLink {
  id: number;
  outage?: ResourceRef | number;
  outage_id?: number;
  security_advisory?: ResourceRef | number;
  security_advisory_id?: number;
  [k: string]: unknown;
}

export interface SecurityAdvisoryNodeStatusFilters {
  nodeId?: number;
  state?: SecurityAdvisoryNodeState;
  limit?: number;
  fromId?: number;
  includes?: string;
}

export interface SecurityAdvisoryAffectedUserFilters {
  securityAdvisoryId?: number;
  userId?: number;
  limit?: number;
  fromId?: number;
  includes?: string;
}

export interface SecurityAdvisoryAffectedVpsFilters {
  securityAdvisoryId?: number;
  vpsId?: number;
  userId?: number;
  environmentId?: number;
  locationId?: number;
  nodeId?: number;
  limit?: number;
  fromId?: number;
  includes?: string;
}

export interface SecurityAdvisoryOutageLinkFilters {
  outageId?: number;
  securityAdvisoryId?: number;
  limit?: number;
  fromId?: number;
  includes?: string;
}

export async function fetchSecurityAdvisoryNodeStatuses(
  securityAdvisoryId: number,
  opts?: SecurityAdvisoryNodeStatusFilters
) {
  const params: Record<string, unknown> = {};
  if (opts?.nodeId !== undefined) params['node'] = opts.nodeId;
  if (opts?.state) params['state'] = opts.state;
  if (opts?.limit !== undefined) params['limit'] = opts.limit;
  if (opts?.fromId !== undefined) params['from_id'] = opts.fromId;

  const res = await haveApiCall<SecurityAdvisoryNodeStatus[]>({
    method: 'GET',
    path: `/security_advisories/${securityAdvisoryId}/node_statuses`,
    namespace: 'node_status',
    params,
    meta: opts?.includes ? { includes: opts.includes } : undefined,
  });

  return {
    ...res,
    data: expectArray<SecurityAdvisoryNodeStatus>(res.data, 'security_advisory#node_statuses#index'),
  };
}

export async function createSecurityAdvisoryNodeStatus(
  securityAdvisoryId: number,
  params: SecurityAdvisoryNodeStatusCreatePayload
) {
  return haveApiCall<SecurityAdvisoryNodeStatus>({
    method: 'POST',
    path: `/security_advisories/${securityAdvisoryId}/node_statuses`,
    namespace: 'node_status',
    params: { ...params },
  });
}

export async function updateSecurityAdvisoryNodeStatus(
  securityAdvisoryId: number,
  nodeStatusId: number,
  params: SecurityAdvisoryNodeStatusUpdatePayload
) {
  return haveApiCall<SecurityAdvisoryNodeStatus>({
    method: 'PUT',
    path: `/security_advisories/${securityAdvisoryId}/node_statuses/${nodeStatusId}`,
    namespace: 'node_status',
    params: { ...params },
  });
}

export async function deleteSecurityAdvisoryNodeStatus(securityAdvisoryId: number, nodeStatusId: number) {
  return haveApiCall<null>({
    method: 'DELETE',
    path: `/security_advisories/${securityAdvisoryId}/node_statuses/${nodeStatusId}`,
  });
}

export async function fetchSecurityAdvisoryAffectedUsers(opts?: SecurityAdvisoryAffectedUserFilters) {
  const params: Record<string, unknown> = {};
  if (opts?.securityAdvisoryId !== undefined) params['security_advisory'] = opts.securityAdvisoryId;
  if (opts?.userId !== undefined) params['user'] = opts.userId;
  if (opts?.limit !== undefined) params['limit'] = opts.limit;
  if (opts?.fromId !== undefined) params['from_id'] = opts.fromId;

  const res = await haveApiCall<SecurityAdvisoryAffectedUser[]>({
    method: 'GET',
    path: '/user_security_advisories',
    namespace: 'user_security_advisory',
    params,
    meta: opts?.includes ? { includes: opts.includes } : undefined,
  });

  return {
    ...res,
    data: expectArray<SecurityAdvisoryAffectedUser>(res.data, 'user_security_advisories#index'),
  };
}

export async function fetchSecurityAdvisoryAffectedVps(opts?: SecurityAdvisoryAffectedVpsFilters) {
  const params: Record<string, unknown> = {};
  if (opts?.securityAdvisoryId !== undefined) params['security_advisory'] = opts.securityAdvisoryId;
  if (opts?.vpsId !== undefined) params['vps'] = opts.vpsId;
  if (opts?.userId !== undefined) params['user'] = opts.userId;
  if (opts?.environmentId !== undefined) params['environment'] = opts.environmentId;
  if (opts?.locationId !== undefined) params['location'] = opts.locationId;
  if (opts?.nodeId !== undefined) params['node'] = opts.nodeId;
  if (opts?.limit !== undefined) params['limit'] = opts.limit;
  if (opts?.fromId !== undefined) params['from_id'] = opts.fromId;

  const res = await haveApiCall<SecurityAdvisoryAffectedVps[]>({
    method: 'GET',
    path: '/vps_security_advisories',
    namespace: 'vps_security_advisory',
    params,
    meta: opts?.includes ? { includes: opts.includes } : undefined,
  });

  return {
    ...res,
    data: expectArray<SecurityAdvisoryAffectedVps>(res.data, 'vps_security_advisories#index'),
  };
}

export async function fetchSecurityAdvisoryOutageLinks(opts?: SecurityAdvisoryOutageLinkFilters) {
  const params: Record<string, unknown> = {};
  if (opts?.outageId !== undefined) params['outage'] = opts.outageId;
  if (opts?.securityAdvisoryId !== undefined) params['security_advisory'] = opts.securityAdvisoryId;
  if (opts?.limit !== undefined) params['limit'] = opts.limit;
  if (opts?.fromId !== undefined) params['from_id'] = opts.fromId;

  const res = await haveApiCall<SecurityAdvisoryOutageLink[]>({
    method: 'GET',
    path: '/outage_security_advisories',
    namespace: 'outage_security_advisory',
    params,
    meta: opts?.includes ? { includes: opts.includes } : undefined,
  });

  return {
    ...res,
    data: expectArray<SecurityAdvisoryOutageLink>(res.data, 'outage_security_advisories#index'),
  };
}

export async function fetchSecurityAdvisoryOutageLink(
  outageSecurityAdvisoryId: number,
  opts?: { includes?: string; signal?: AbortSignal }
) {
  return haveApiCall<SecurityAdvisoryOutageLink>({
    method: 'GET',
    path: `/outage_security_advisories/${outageSecurityAdvisoryId}`,
    meta: opts?.includes ? { includes: opts.includes } : undefined,
    signal: opts?.signal,
  });
}

export async function createSecurityAdvisoryOutageLink(params: {
  outage: number;
  security_advisory: number;
}) {
  return haveApiCall<SecurityAdvisoryOutageLink>({
    method: 'POST',
    path: '/outage_security_advisories',
    namespace: 'outage_security_advisory',
    params: { ...params },
  });
}

export async function deleteSecurityAdvisoryOutageLink(outageSecurityAdvisoryId: number) {
  return haveApiCall<null>({
    method: 'DELETE',
    path: `/outage_security_advisories/${outageSecurityAdvisoryId}`,
  });
}
