import { expectArray, haveApiCall, requireActionStateResult } from './haveapi';
import type { ResourceRef } from './app';

export type VpsUserDataFormat =
  | 'script'
  | 'cloudinit_config'
  | 'cloudinit_script'
  | 'nixos_configuration'
  | 'nixos_flake_configuration'
  | 'nixos_flake_uri';

export interface VpsUserData {
  id: number;
  user?: ResourceRef;
  label: string;
  format: VpsUserDataFormat | string;
  content?: string;
  created_at?: string;
  updated_at?: string;
  [k: string]: unknown;
}

export async function fetchVpsUserDataList(opts?: {
  user?: number;
  format?: string;
  q?: string;
  limit?: number;
  fromId?: number | null;
}): Promise<{ data: VpsUserData[]; meta?: Record<string, unknown> }> {
  const res = await haveApiCall<unknown>({
    method: 'GET',
    path: '/vps_user_data',
    namespace: 'vps_user_data',
    params: {
      user: opts?.user,
      format: opts?.format,
      q: opts?.q,
      limit: opts?.limit,
      from_id: opts?.fromId ?? undefined,
    },
  });

  return {
    data: expectArray<VpsUserData>(res.data as any, 'vps_user_data.index'),
    meta: res.meta,
  };
}

export async function fetchVpsUserData(id: number): Promise<{ data: VpsUserData; meta?: Record<string, unknown> }> {
  const res = await haveApiCall<VpsUserData>({
    method: 'GET',
    path: `/vps_user_data/${id}`,
  });

  return { data: res.data as any, meta: res.meta };
}

export async function createVpsUserData(payload: {
  user?: number;
  label: string;
  format: string;
  content: string;
}): Promise<{ data: VpsUserData; meta?: Record<string, unknown> }> {
  const res = await haveApiCall<VpsUserData>({
    method: 'POST',
    path: '/vps_user_data',
    namespace: 'vps_user_data',
    params: payload as any,
  });

  return { data: res.data as any, meta: res.meta };
}

export async function updateVpsUserData(
  id: number,
  payload: {
    label?: string;
    format?: string;
    content?: string;
  }
): Promise<{ data: VpsUserData; meta?: Record<string, unknown> }> {
  const res = await haveApiCall<VpsUserData>({
    method: 'PUT',
    path: `/vps_user_data/${id}`,
    namespace: 'vps_user_data',
    params: payload as any,
  });

  return { data: res.data as any, meta: res.meta };
}

export async function deleteVpsUserData(id: number): Promise<void> {
  await haveApiCall<null>({
    method: 'DELETE',
    path: `/vps_user_data/${id}`,
  });
}

export async function deployVpsUserData(id: number, vpsId: number): Promise<{ meta?: Record<string, unknown> }> {
  const res = await haveApiCall<null>({
    method: 'POST',
    path: `/vps_user_data/${id}/deploy`,
    namespace: 'vps_user_data',
    params: {
      vps: vpsId,
    },
  });

  return requireActionStateResult({ meta: res.meta }, 'VPS user-data deployment');
}
