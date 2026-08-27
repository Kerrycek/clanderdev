import { expectArray, haveApiCall } from './haveapi';
import { withoutDnsSecrets } from './dnsSecretScrubber';
import type { ResourceRef } from './dns';

interface DnsTsigKey {
  id: number;
  user?: ResourceRef & { login?: string };
  name?: string;
  algorithm?: string;
  secret?: string;
  created_at?: string;
  updated_at?: string;
  [k: string]: unknown;
}

/** A TSIG key as it is safe to keep in list/query state. */
export interface DnsTsigKeySummary {
  id: number;
  user?: ResourceRef & { login?: string };
  name?: string;
  algorithm?: string;
  created_at?: string;
  updated_at?: string;
  [k: string]: unknown;
}

export interface DnsTsigKeyOneTimeSecret {
  name: string;
  secret: string;
}

export interface CreateDnsTsigKeyOptions {
  /**
   * Receives the secret synchronously before the API result is scrubbed. The
   * returned promise never contains the secret, so query state cannot retain it.
   */
  onOneTimeSecret?: (value: DnsTsigKeyOneTimeSecret) => void;
}

/** Algorithms accepted by the upstream DnsTsigKey model. */
export const DNS_TSIG_ALGORITHMS = [
  'hmac-sha224',
  'hmac-sha256',
  'hmac-sha384',
  'hmac-sha512',
] as const;

export async function fetchDnsTsigKeys(opts?: {
  fromId?: number;
  limit?: number;
  user?: number;
  algorithm?: string;
}) {
  const params: Record<string, unknown> = {};
  if (opts?.fromId !== undefined) params['from_id'] = opts.fromId;
  if (opts?.limit !== undefined) params['limit'] = opts.limit;
  if (opts?.user !== undefined) params['user'] = opts.user;
  if (opts?.algorithm !== undefined) params['algorithm'] = opts.algorithm;

  const res = await haveApiCall<DnsTsigKey[]>({
    method: 'GET',
    path: '/dns_tsig_keys',
    namespace: 'dns_tsig_key',
    params,
    meta: { includes: 'user' },
  });

  // Scrub the complete result: HaveAPI envelopes and metadata are cached too.
  const safeRes = withoutDnsSecrets(res);
  const safeRows = expectArray<DnsTsigKeySummary>(safeRes.data, 'dns_tsig_keys#index');
  return { ...safeRes, data: safeRows };
}

export async function createDnsTsigKey(
  payload: { user?: number; name: string; algorithm?: string },
  options?: CreateDnsTsigKeyOptions
) {
  const result = await haveApiCall<DnsTsigKey>({
    method: 'POST',
    path: '/dns_tsig_keys',
    namespace: 'dns_tsig_key',
    params: payload,
  });

  const secret = typeof result.data?.secret === 'string' ? result.data.secret : '';
  if (secret) {
    options?.onOneTimeSecret?.({
      name: String(result.data?.name ?? payload.name),
      secret,
    });
  }

  return withoutDnsSecrets(result) as {
    data: DnsTsigKeySummary;
    meta?: Record<string, unknown>;
    envelope: typeof result.envelope;
  };
}

export async function deleteDnsTsigKey(id: number) {
  return haveApiCall<void>({ method: 'DELETE', path: `/dns_tsig_keys/${id}` });
}
