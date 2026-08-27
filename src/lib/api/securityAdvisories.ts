import type { ResourceRef } from './appTypes';
import { expectArray, haveApiCall } from './haveapi';

export * from './securityAdvisoryRelations';
export * from './securityAdvisoryUpdates';

export type SecurityAdvisoryState = 'draft' | 'published' | 'retracted' | string;

type LocalizedPayload<Field extends string, Value = string> = Partial<Record<`${string}_${Field}`, Value>>;

export type SecurityAdvisoryPayload = {
  name?: string | null;
  published_at?: string | null;
} & LocalizedPayload<'summary' | 'description' | 'response'>;

export interface SecurityAdvisoryPublishPayload {
  send_mail?: boolean;
  published_at?: string | null;
}

export interface SecurityAdvisoryCve {
  id: number;
  security_advisory?: ResourceRef | number;
  security_advisory_id?: number;
  cve_id?: string;
  url?: string;
  [k: string]: unknown;
}

export interface SecurityAdvisory {
  id: number;
  state?: SecurityAdvisoryState;
  name?: string | null;
  published_at?: string | null;
  retracted_at?: string | null;
  created_at?: string;
  updated_at?: string;
  affected?: boolean;
  affected_node_count?: number;
  affected_user_count?: number;
  affected_vps_count?: number;
  created_by?: ResourceRef | null;
  published_by?: ResourceRef | null;
  /** Populated by fetchSecurityAdvisoriesWithCves(). */
  cves?: Array<SecurityAdvisoryCve | string>;
  /** Tolerated shape in case a deployment includes CVEs inline. */
  security_advisory_cves?: Array<SecurityAdvisoryCve | string>;
  // translation fields: e.g. en_summary, cs_description, en_response, ...
  [k: string]: unknown;
}

export interface SecurityAdvisoryFilters {
  limit?: number;
  fromId?: number;
  count?: boolean;
  state?: string;
  affected?: boolean;
  cve?: string;
  recentSince?: string;
  userId?: number;
  vpsId?: number;
  nodeId?: number;
  since?: string;
  order?: 'newest' | 'oldest';
  includes?: string;
}

export interface SecurityAdvisoryAllFilters extends SecurityAdvisoryFilters {
  /** Safety guard for unexpectedly repeating or unbounded API pages. */
  maxPages?: number;
}

export interface SecurityAdvisoryCveFilters {
  securityAdvisoryId?: number;
  cve?: string;
  limit?: number;
  fromId?: number;
  includes?: string;
}

function securityAdvisoryParams(opts?: SecurityAdvisoryFilters): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  if (opts?.limit !== undefined) params['limit'] = opts.limit;
  if (opts?.fromId !== undefined) params['from_id'] = opts.fromId;
  if (opts?.state) params['state'] = opts.state;
  if (opts?.affected !== undefined) params['affected'] = opts.affected;
  if (opts?.cve) params['cve'] = opts.cve;
  if (opts?.recentSince) params['recent_since'] = opts.recentSince;
  if (opts?.userId !== undefined) params['user'] = opts.userId;
  if (opts?.vpsId !== undefined) params['vps'] = opts.vpsId;
  if (opts?.nodeId !== undefined) params['node'] = opts.nodeId;
  if (opts?.since) params['since'] = opts.since;
  if (opts?.order) params['order'] = opts.order;
  return params;
}

export async function fetchSecurityAdvisories(opts?: SecurityAdvisoryFilters) {
  const meta: Record<string, unknown> = {};
  if (opts?.includes) meta['includes'] = opts.includes;
  if (opts?.count) meta['count'] = true;
  const res = await haveApiCall<SecurityAdvisory[]>({
    method: 'GET',
    path: '/security_advisories',
    namespace: 'security_advisory',
    params: securityAdvisoryParams(opts),
    meta: Object.keys(meta).length > 0 ? meta : undefined,
  });

  return { ...res, data: expectArray<SecurityAdvisory>(res.data, 'security_advisories#index') };
}

const SECURITY_ADVISORY_PAGE_LIMIT = 100;
const SECURITY_ADVISORY_MAX_PAGES = 100;

function numericSecurityAdvisoryId(advisory: SecurityAdvisory | undefined): number | undefined {
  const id = advisory?.id;
  return typeof id === 'number' && Number.isFinite(id) ? id : undefined;
}

/**
 * Fetch every advisory cursor page while preserving the index filters and
 * order. HaveAPI may repeat the cursor row on the following page, so rows are
 * de-duplicated by ID. A full page that cannot advance is an error: returning
 * it would silently truncate the public archive.
 */
export async function fetchAllSecurityAdvisories(opts: SecurityAdvisoryAllFilters = {}) {
  const pageLimit = Number.isInteger(opts.limit) && Number(opts.limit) > 0
    ? Number(opts.limit)
    : SECURITY_ADVISORY_PAGE_LIMIT;
  const maxPages = Number.isInteger(opts.maxPages) && Number(opts.maxPages) > 0
    ? Number(opts.maxPages)
    : SECURITY_ADVISORY_MAX_PAGES;
  const { maxPages: _maxPages, ...filters } = opts;

  const data: SecurityAdvisory[] = [];
  const seenIds = new Set<number>();
  const seenCursors = new Set<number>();
  let cursor = filters.fromId;
  if (typeof cursor === 'number' && Number.isFinite(cursor)) seenCursors.add(cursor);

  let firstResult: Awaited<ReturnType<typeof fetchSecurityAdvisories>> | null = null;

  for (let pageNumber = 0; pageNumber < maxPages; pageNumber += 1) {
    const page = await fetchSecurityAdvisories({
      ...filters,
      limit: pageLimit,
      fromId: cursor,
    });
    firstResult ??= page;

    for (const advisory of page.data) {
      const id = numericSecurityAdvisoryId(advisory);
      if (id !== undefined) {
        if (seenIds.has(id)) continue;
        seenIds.add(id);
      }
      data.push(advisory);
    }

    if (page.data.length < pageLimit) return { ...firstResult, data };

    let nextCursor: number | undefined;
    for (let index = page.data.length - 1; index >= 0; index -= 1) {
      nextCursor = numericSecurityAdvisoryId(page.data[index]);
      if (nextCursor !== undefined) break;
    }

    if (nextCursor === undefined || seenCursors.has(nextCursor)) {
      throw new Error('Security advisory pagination stalled before the archive was complete');
    }
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }

  throw new Error('Security advisory pagination exceeded its safety limit');
}

export async function fetchSecurityAdvisory(
  securityAdvisoryId: number,
  opts?: { includes?: string; signal?: AbortSignal }
) {
  return haveApiCall<SecurityAdvisory>({
    method: 'GET',
    path: `/security_advisories/${securityAdvisoryId}`,
    meta: opts?.includes ? { includes: opts.includes } : undefined,
    signal: opts?.signal,
  });
}

export async function createSecurityAdvisory(params: SecurityAdvisoryPayload) {
  return haveApiCall<SecurityAdvisory>({
    method: 'POST',
    path: '/security_advisories',
    namespace: 'security_advisory',
    params: { ...params },
  });
}

export async function updateSecurityAdvisory(securityAdvisoryId: number, params: SecurityAdvisoryPayload) {
  return haveApiCall<SecurityAdvisory>({
    method: 'PUT',
    path: `/security_advisories/${securityAdvisoryId}`,
    namespace: 'security_advisory',
    params: { ...params },
  });
}

export async function publishSecurityAdvisory(
  securityAdvisoryId: number,
  params: SecurityAdvisoryPublishPayload = {}
) {
  return haveApiCall<SecurityAdvisory>({
    method: 'POST',
    path: `/security_advisories/${securityAdvisoryId}/publish`,
    namespace: 'security_advisory',
    params: { ...params },
  });
}

export async function rebuildSecurityAdvisoryAffectedVps(securityAdvisoryId: number) {
  return haveApiCall<null>({
    method: 'POST',
    path: `/security_advisories/${securityAdvisoryId}/rebuild_affected_vps`,
  });
}

export async function fetchSecurityAdvisoryCves(opts?: SecurityAdvisoryCveFilters) {
  const params: Record<string, unknown> = {};
  if (opts?.securityAdvisoryId !== undefined) params['security_advisory'] = opts.securityAdvisoryId;
  if (opts?.cve) params['cve'] = opts.cve;
  if (opts?.limit !== undefined) params['limit'] = opts.limit;
  if (opts?.fromId !== undefined) params['from_id'] = opts.fromId;

  const res = await haveApiCall<SecurityAdvisoryCve[]>({
    method: 'GET',
    path: '/security_advisory_cves',
    namespace: 'security_advisory_cve',
    params,
    meta: opts?.includes ? { includes: opts.includes } : undefined,
  });

  return { ...res, data: expectArray<SecurityAdvisoryCve>(res.data, 'security_advisory_cves#index') };
}

export async function fetchSecurityAdvisoryCve(
  securityAdvisoryCveId: number,
  opts?: { includes?: string; signal?: AbortSignal }
) {
  return haveApiCall<SecurityAdvisoryCve>({
    method: 'GET',
    path: `/security_advisory_cves/${securityAdvisoryCveId}`,
    meta: opts?.includes ? { includes: opts.includes } : undefined,
    signal: opts?.signal,
  });
}

export async function createSecurityAdvisoryCve(params: { security_advisory: number; cve_id: string }) {
  return haveApiCall<SecurityAdvisoryCve>({
    method: 'POST',
    path: '/security_advisory_cves',
    namespace: 'security_advisory_cve',
    params: { ...params },
  });
}

export async function updateSecurityAdvisoryCve(
  securityAdvisoryCveId: number,
  params: Partial<{ security_advisory: number; cve_id: string }>
) {
  return haveApiCall<SecurityAdvisoryCve>({
    method: 'PUT',
    path: `/security_advisory_cves/${securityAdvisoryCveId}`,
    namespace: 'security_advisory_cve',
    params: { ...params },
  });
}

export async function deleteSecurityAdvisoryCve(securityAdvisoryCveId: number) {
  return haveApiCall<null>({
    method: 'DELETE',
    path: `/security_advisory_cves/${securityAdvisoryCveId}`,
  });
}

export async function fetchSecurityAdvisoriesWithCves(opts?: SecurityAdvisoryFilters) {
  const advisories = await fetchSecurityAdvisories(opts);

  const cveLists = await Promise.all(
    advisories.data.map(async (advisory) => {
      if (advisory.security_advisory_cves || advisory.cves) {
        return advisoryCveObjects(advisory);
      }

      try {
        const cves = await fetchSecurityAdvisoryCves({ securityAdvisoryId: advisory.id });
        return cves.data;
      } catch {
        // Keep the dashboard useful even if the older API does not expose CVE joins
        // to the current session; the advisory itself is still important signal.
        return [];
      }
    })
  );

  return {
    ...advisories,
    data: advisories.data.map((advisory, idx) => ({
      ...advisory,
      cves: cveLists[idx] ?? [],
    })),
  };
}

function cveLabel(item: unknown): string | null {
  if (typeof item === 'string') {
    const s = item.trim().toUpperCase();
    return s || null;
  }

  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  const nested = obj['cve'];
  if (nested && typeof nested === 'object') {
    const nestedLabel = cveLabel(nested);
    if (nestedLabel) return nestedLabel;
  }

  const raw = obj['cve_id'] ?? obj['cveId'] ?? obj['name'] ?? obj['label'];
  if (typeof raw === 'string') {
    const s = raw.trim().toUpperCase();
    return s || null;
  }

  return null;
}

function advisoryCveObjects(advisory: SecurityAdvisory): SecurityAdvisoryCve[] {
  const raw = advisory.security_advisory_cves ?? advisory.cves ?? [];
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) => {
      if (typeof item === 'string') {
        return { id: 0, cve_id: item.trim().toUpperCase() } satisfies SecurityAdvisoryCve;
      }
      return item && typeof item === 'object' ? (item as SecurityAdvisoryCve) : null;
    })
    .filter((item): item is SecurityAdvisoryCve => item !== null);
}

export function advisoryCveLabels(advisory: SecurityAdvisory): string[] {
  const labels = advisoryCveObjects(advisory).map(cveLabel).filter((v): v is string => Boolean(v));
  return [...new Set(labels)].sort((a, b) => a.localeCompare(b));
}
