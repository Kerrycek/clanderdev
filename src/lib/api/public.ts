import { getRuntimeConfig } from '../../app/config';
import { expectArray, HaveApiError, type HaveApiEnvelope, unwrapSingleResponse } from './haveapi';

export interface PublicApiCallOpts {
  path: string;
  namespace?: string;
  params?: Record<string, unknown>;
}

function buildPublicQuery(namespace: string, params: Record<string, unknown>): URLSearchParams {
  const qs = new URLSearchParams();

  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    if (v === null) {
      qs.append(`${namespace}[${k}]`, '');
      continue;
    }

    const t = typeof v;
    if (t === 'string' || t === 'number' || t === 'boolean') {
      qs.append(`${namespace}[${k}]`, String(v));
      continue;
    }

    throw new HaveApiError(
      {
        status: false,
        message: `Invalid query parameter ${namespace}[${k}] (must be string/number/boolean/null)`,
        response: { key: k, value: v },
      },
      'Invalid query parameter'
    );
  }

  return qs;
}

async function safePublicJson(res: Response): Promise<HaveApiEnvelope> {
  try {
    return (await res.json()) as HaveApiEnvelope;
  } catch {
    return {
      status: false,
      message: `Invalid JSON response (HTTP ${res.status})`,
      response: null,
    };
  }
}

export async function publicApiCall<T>(opts: PublicApiCallOpts): Promise<{ data: T; meta?: Record<string, unknown>; envelope: HaveApiEnvelope }> {
  const cfg = getRuntimeConfig();
  let url = `${cfg.apiBaseUrl}${opts.path.startsWith('/') ? '' : '/'}${opts.path}`;

  if (opts.namespace && opts.params) {
    const qs = buildPublicQuery(opts.namespace, opts.params);
    if ([...qs.keys()].length > 0) {
      url += (url.includes('?') ? '&' : '?') + qs.toString();
    }
  }

  const reqInfo = { method: 'GET', path: opts.path, url };
  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
  });
  const envelope = await safePublicJson(res);

  if (!res.ok) {
    throw new HaveApiError(envelope, `HTTP ${res.status}`, res.status, reqInfo);
  }

  const unwrapped = unwrapSingleResponse<T>(envelope, cfg.haveApi?.metaNamespace ?? '_meta');
  return { ...unwrapped, envelope };
}

export interface PublicClusterStats {
  user_count: number;
  vps_count: number;
  ipv4_left: number;
}

export interface LocationRef {
  id?: number;
  label?: string;
}

export interface PublicNodeStatus {
  status: boolean;
  name: string;
  fqdn?: string;
  location?: LocationRef;
  last_report?: string;
  vps_count?: number;
  vps_free?: number;
  kernel?: string;
  type?: string;
  hypervisor_type?: string;
  cpu_idle?: number;
  maintenance_lock?: string;
  maintenance_lock_reason?: string;
  // Additional fields may appear depending on node role / exports.
  [k: string]: unknown;
}

export type OutageState = string;
export interface Outage {
  id: number;
  begins_at?: string;
  finished_at?: string | null;
  duration?: number | null;
  type?: string;
  state?: OutageState;
  impact?: string;
  auto_resolve?: boolean;
  affected?: boolean;
  affected_user_count?: number;
  affected_direct_vps_count?: number;
  affected_indirect_vps_count?: number;
  affected_export_count?: number;
  // translation fields: e.g. en_summary, cs_description, ...
  [k: string]: unknown;
}

export interface OutageEntity {
  id: number;
  name: string;
  entity_id?: number | null;
  label?: string;
}

export interface OutageHandler {
  id: number;
  full_name?: string;
  note?: string;
  reporter_name?: string;
  [k: string]: unknown;
}

export interface OutageUpdate {
  id: number;
  outage?: { id: number; begins_at?: string };
  type?: string;
  begins_at?: string;
  finished_at?: string | null;
  duration?: number | null;
  state?: string;
  impact?: string;
  created_at?: string;
  reporter_name?: string;
  [k: string]: unknown;
}

export interface NewsLog {
  id: number;
  message: string;
  published_at?: string;
  created_at?: string;
  updated_at?: string;
  [k: string]: unknown;
}

export async function fetchPublicStats() {
  return publicApiCall<PublicClusterStats>({
    path: '/cluster/public_stats',
  });
}

export async function fetchPublicNodeStatus() {
  const res = await publicApiCall<PublicNodeStatus[]>({
    path: '/nodes/public_status',
  });
  return { ...res, data: expectArray<PublicNodeStatus>(res.data, 'nodes/public_status') };
}

export async function fetchOutages(opts?: { limit?: number }) {
  const res = await publicApiCall<Outage[]>({
    path: '/outages',
    namespace: 'outage',
    params: opts?.limit ? { limit: opts.limit } : undefined,
  });
  return { ...res, data: expectArray<Outage>(res.data, 'outages') };
}

export async function fetchOutage(outageId: number) {
  return publicApiCall<Outage>({
    path: `/outages/${outageId}`,
  });
}

export async function fetchOutageEntities(outageId: number) {
  const res = await publicApiCall<OutageEntity[]>({
    path: `/outages/${outageId}/entities`,
  });
  return { ...res, data: expectArray<OutageEntity>(res.data, `outages/${outageId}/entities`) };
}

export async function fetchOutageHandlers(outageId: number) {
  const res = await publicApiCall<OutageHandler[]>({
    path: `/outages/${outageId}/handlers`,
  });
  return { ...res, data: expectArray<OutageHandler>(res.data, `outages/${outageId}/handlers`) };
}

export async function fetchOutageUpdates(outageId: number) {
  // Index input is namespaced under outage_update[...] in the query string.
  const res = await publicApiCall<OutageUpdate[]>({
    path: '/outage_updates',
    namespace: 'outage_update',
    params: { outage: outageId },
  });
  return { ...res, data: expectArray<OutageUpdate>(res.data, 'outage_updates') };
}

export async function fetchNews(opts?: { limit?: number }) {
  const res = await publicApiCall<NewsLog[]>({
    path: '/news_logs',
    namespace: 'news_log',
    params: opts?.limit ? { limit: opts.limit } : undefined,
  });
  return { ...res, data: expectArray<NewsLog>(res.data, 'news_logs') };
}
