import { expectArray, haveApiCall, requireActionStateResult } from './haveapi';
import { fetchUserPublicKeys, type UserPublicKey } from './userDossier';
import { fetchCurrentUser, type User } from './users';

export type VpsPasswordType = 'secure' | 'simple';

export interface VpsPasswordOptions {
  type?: VpsPasswordType;
}

export interface VpsGeneratedPassword {
  password: string;
}

export type UserIdentity = User;
export type VpsPublicKey = UserPublicKey;

export interface VpsSshHostKey {
  id?: number | string;
  key_type?: string;
  type?: string;
  algorithm?: string;
  bits?: number | string;
  fingerprint?: string;
  sha256_fingerprint?: string;
  md5_fingerprint?: string;
  public_key?: string;
  key?: string;
  host_key?: string;
  created_at?: string;
}

export interface ApiResult<T> {
  data: T;
  meta?: Record<string, unknown>;
  raw?: unknown;
}

function withRaw<T>(res: { data: T; meta?: Record<string, unknown>; envelope?: unknown }): ApiResult<T> {
  return { data: res.data, meta: res.meta, raw: res.envelope };
}

export async function resetVpsRootPassword(vpsId: number, options?: VpsPasswordOptions): Promise<ApiResult<VpsGeneratedPassword>> {
  const res = await haveApiCall<VpsGeneratedPassword>({
    method: 'POST',
    path: `/vpses/${vpsId}/passwd`,
    namespace: 'vps',
    params: { type: options?.type ?? 'secure' },
  });

  return withRaw(requireActionStateResult(res, 'VPS password reset'));
}

export async function getCurrentUser(): Promise<ApiResult<UserIdentity>> {
  return withRaw(await fetchCurrentUser());
}

export async function listUserPublicKeys(userId: number): Promise<ApiResult<VpsPublicKey[]>> {
  const res = await fetchUserPublicKeys(userId, { limit: 100 });
  return { ...withRaw(res), data: expectArray<VpsPublicKey>(res.data, `users/${userId}/public_keys`) };
}

export async function deployVpsPublicKey(vpsId: number, publicKeyId: number): Promise<ApiResult<Record<string, never>>> {
  const res = await haveApiCall<Record<string, never>>({
    method: 'POST',
    path: `/vpses/${vpsId}/deploy_public_key`,
    namespace: 'vps',
    params: { public_key: publicKeyId },
  });

  return withRaw(requireActionStateResult(res, 'VPS public-key deployment'));
}

export async function listVpsSshHostKeys(vpsId: number): Promise<ApiResult<VpsSshHostKey[]>> {
  const res = await haveApiCall<VpsSshHostKey[]>({
    method: 'GET',
    path: `/vpses/${vpsId}/ssh_host_keys`,
  });

  return { ...withRaw(res), data: expectArray<VpsSshHostKey>(res.data, `vpses/${vpsId}/ssh_host_keys`) };
}
