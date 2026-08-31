import { expectArray, haveApiCall } from './haveapi';

export interface Environment {
  id: number;
  label?: string;
  description?: string;
  domain?: string;

  can_create_vps?: boolean;
  can_destroy_vps?: boolean;
  vps_lifetime?: number;
  max_vps_count?: number;
  user_ip_ownership?: boolean;
  maintenance_lock?: string;
  maintenance_lock_reason?: string;

  [k: string]: unknown;
}

export interface Location {
  id: number;
  label?: string;
  description?: string;
  domain?: string;

  has_ipv6?: boolean;
  remote_console_server?: string;

  environment?: Environment;
  maintenance_lock?: string;
  maintenance_lock_reason?: string;
  [k: string]: unknown;
}

export async function fetchEnvironments(opts?: { limit?: number; q?: string; hasHypervisor?: boolean; hasStorage?: boolean }) {
  const params: Record<string, unknown> = {};
  if (opts?.limit !== undefined) params['limit'] = opts.limit;
  if (opts?.q) params['q'] = String(opts.q).trim();
  if (opts?.hasHypervisor !== undefined) params['has_hypervisor'] = opts.hasHypervisor;
  if (opts?.hasStorage !== undefined) params['has_storage'] = opts.hasStorage;

  const res = await haveApiCall<Environment[]>({
    method: 'GET',
    path: '/environments',
    namespace: 'environment',
    params,
  });

  return { ...res, data: expectArray<Environment>(res.data, 'environments#index') };
}

export async function fetchLocations(opts?: {
  limit?: number;
  q?: string;
  environmentId?: number;
  hasHypervisor?: boolean;
  hasStorage?: boolean;
  hypervisorType?: string;
  includes?: string;
  sharesNetworksWithLocationId?: number;
  sharesNetworksWithVersion?: 4 | 6 | 'any';
  sharesNetworksPrimary?: boolean;
}) {
  const params: Record<string, unknown> = {};
  if (opts?.limit !== undefined) params['limit'] = opts.limit;
  if (opts?.q) params['q'] = String(opts.q).trim();
  if (opts?.environmentId !== undefined) params['environment'] = opts.environmentId;
  if (opts?.hasHypervisor !== undefined) params['has_hypervisor'] = opts.hasHypervisor;
  if (opts?.hasStorage !== undefined) params['has_storage'] = opts.hasStorage;
  if (opts?.hypervisorType) params['hypervisor_type'] = opts.hypervisorType;

  if (opts?.sharesNetworksWithLocationId !== undefined) {
    const id = opts.sharesNetworksWithLocationId;
    const ver = opts.sharesNetworksWithVersion ?? 'any';

    if (ver === 4) params['shares_v4_networks_with'] = id;
    else if (ver === 6) params['shares_v6_networks_with'] = id;
    else params['shares_any_networks_with'] = id;

    if (opts?.sharesNetworksPrimary !== undefined) params['shares_networks_primary'] = opts.sharesNetworksPrimary;
  }

  const res = await haveApiCall<Location[]>({
    method: 'GET',
    path: '/locations',
    namespace: 'location',
    params,
    meta: opts?.includes ? { includes: opts.includes } : undefined,
  });

  return { ...res, data: expectArray<Location>(res.data, 'locations#index') };
}

export async function createEnvironment(payload: Record<string, unknown>) {
  return haveApiCall<Environment>({
    method: 'POST',
    path: '/environments',
    namespace: 'environment',
    params: payload,
  });
}

export async function updateEnvironment(environmentId: number, payload: Record<string, unknown>) {
  return haveApiCall<Environment>({
    method: 'PUT',
    path: `/environments/${environmentId}`,
    namespace: 'environment',
    params: payload,
  });
}

export async function createLocation(payload: Record<string, unknown>) {
  return haveApiCall<Location>({
    method: 'POST',
    path: '/locations',
    namespace: 'location',
    params: payload,
  });
}

export async function updateLocation(locationId: number, payload: Record<string, unknown>) {
  return haveApiCall<Location>({
    method: 'PUT',
    path: `/locations/${locationId}`,
    namespace: 'location',
    params: payload,
  });
}

export async function setEnvironmentMaintenance(environmentId: number, opts: { lock: boolean; reason?: string }) {
  return haveApiCall<void>({
    method: 'POST',
    path: `/environments/${environmentId}/set_maintenance`,
    namespace: 'environment',
    params: { lock: opts.lock, reason: opts.reason },
  });
}

export async function setLocationMaintenance(locationId: number, opts: { lock: boolean; reason?: string }) {
  return haveApiCall<void>({
    method: 'POST',
    path: `/locations/${locationId}/set_maintenance`,
    namespace: 'location',
    params: { lock: opts.lock, reason: opts.reason },
  });
}
