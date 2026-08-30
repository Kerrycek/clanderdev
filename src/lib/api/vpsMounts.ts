import { expectArray, haveApiCall, requireActionStateResult } from './haveapi';
import type { ResourceRef } from './appTypes';
import type { User } from './users';

export interface Dataset {
  id: number;
  name?: string;
  full_name?: string;
  label?: string;
  user?: User | ResourceRef;
  [k: string]: unknown;
}

export interface VpsMount {
  id: number;
  vps?: ResourceRef;
  dataset?: Dataset | ResourceRef;
  user_namespace_map?: ResourceRef;
  mountpoint?: string;
  type?: string;
  mode?: string;
  on_start_fail?: string;
  enabled?: boolean;
  master_enabled?: boolean;
  use_default_map?: boolean;
  current_state?: string;
  expiration_date?: string | null;
  created_at?: string;
  updated_at?: string;
  [k: string]: unknown;
}

export async function findDatasetByName(name: string) {
  return haveApiCall<Dataset>({
    method: 'GET',
    path: '/datasets/find_by_name',
    namespace: 'dataset',
    params: { name },
  });
}

export async function fetchVpsMounts(vpsId: number) {
  const res = await haveApiCall<VpsMount[]>({
    method: 'GET',
    path: `/vpses/${vpsId}/mounts`,
  });
  return { ...res, data: expectArray<VpsMount>(res.data, `vpses/${vpsId}/mounts`) };
}

export async function createVpsMount(vpsId: number, params: Record<string, unknown>) {
  const res = await haveApiCall<VpsMount>({
    method: 'POST',
    path: `/vpses/${vpsId}/mounts`,
    namespace: 'mount',
    params,
  });
  return requireActionStateResult(res, 'VPS mount create');
}

export async function updateVpsMount(vpsId: number, mountId: number, params: Record<string, unknown>) {
  const res = await haveApiCall<VpsMount>({
    method: 'PUT',
    path: `/vpses/${vpsId}/mounts/${mountId}`,
    namespace: 'mount',
    params,
  });
  return requireActionStateResult(res, 'VPS mount update');
}

export async function deleteVpsMount(vpsId: number, mountId: number) {
  const res = await haveApiCall<void>({
    method: 'DELETE',
    path: `/vpses/${vpsId}/mounts/${mountId}`,
  });
  return requireActionStateResult(res, 'VPS mount delete');
}
