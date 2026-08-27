import type { ResourceRef } from './appTypes';
import { expectArray, haveApiCall } from './haveapi';
import type { SecurityAdvisoryState } from './securityAdvisories';

type LocalizedPayload<Field extends string, Value = string> = Partial<
  Record<`${string}_${Field}`, Value>
>;

export interface SecurityAdvisoryUpdate {
  id: number;
  security_advisory?: ResourceRef | number;
  security_advisory_id?: number;
  state?: SecurityAdvisoryState | null;
  reported_by?: ResourceRef | number | null;
  reported_by_id?: number | null;
  reporter_name?: string | null;
  name?: string | null;
  created_at?: string;
  updated_at?: string | null;
  [k: string]: unknown;
}

export type SecurityAdvisoryUpdateTextPayload = LocalizedPayload<'summary'> &
  LocalizedPayload<'message', string | null>;

export type SecurityAdvisoryUpdateCreatePayload = {
  security_advisory: number;
  state?: SecurityAdvisoryState | null;
  published_at?: string | null;
  send_mail?: boolean;
} & SecurityAdvisoryUpdateTextPayload;

export interface SecurityAdvisoryUpdateFilters {
  securityAdvisoryId?: number;
  since?: string;
  limit?: number;
  fromId?: number;
  includes?: string;
}

export interface SecurityAdvisoryUpdateAllFilters extends SecurityAdvisoryUpdateFilters {
  /** Safety guard for unexpectedly repeating or unbounded API pages. */
  maxPages?: number;
}

export async function fetchSecurityAdvisoryUpdates(opts?: SecurityAdvisoryUpdateFilters) {
  const params: Record<string, unknown> = {};
  if (opts?.securityAdvisoryId !== undefined) params['security_advisory'] = opts.securityAdvisoryId;
  if (opts?.since) params['since'] = opts.since;
  if (opts?.limit !== undefined) params['limit'] = opts.limit;
  if (opts?.fromId !== undefined) params['from_id'] = opts.fromId;

  const res = await haveApiCall<SecurityAdvisoryUpdate[]>({
    method: 'GET',
    path: '/security_advisory_updates',
    namespace: 'security_advisory_update',
    params,
    meta: opts?.includes ? { includes: opts.includes } : undefined,
  });

  return {
    ...res,
    data: expectArray<SecurityAdvisoryUpdate>(res.data, 'security_advisory_updates#index'),
  };
}

const SECURITY_ADVISORY_UPDATE_PAGE_LIMIT = 100;
const SECURITY_ADVISORY_UPDATE_MAX_PAGES = 100;

function numericSecurityAdvisoryUpdateId(
  update: SecurityAdvisoryUpdate | undefined,
): number | undefined {
  const id = update?.id;
  return typeof id === 'number' && Number.isFinite(id) ? id : undefined;
}

/**
 * Fetch every cursor page while retaining the filters and includes used for
 * the first request. The API may include the cursor row again on the next
 * page, so results are de-duplicated by their numeric ID.
 */
export async function fetchAllSecurityAdvisoryUpdates(
  opts: SecurityAdvisoryUpdateAllFilters = {},
) {
  const pageLimit = Number.isInteger(opts.limit) && Number(opts.limit) > 0
    ? Number(opts.limit)
    : SECURITY_ADVISORY_UPDATE_PAGE_LIMIT;
  const maxPages = Number.isInteger(opts.maxPages) && Number(opts.maxPages) > 0
    ? Number(opts.maxPages)
    : SECURITY_ADVISORY_UPDATE_MAX_PAGES;
  const { maxPages: _maxPages, ...filters } = opts;

  const data: SecurityAdvisoryUpdate[] = [];
  const seenIds = new Set<number>();
  const seenCursors = new Set<number>();
  let cursor = filters.fromId;
  if (typeof cursor === 'number' && Number.isFinite(cursor)) seenCursors.add(cursor);

  let firstResult: Awaited<ReturnType<typeof fetchSecurityAdvisoryUpdates>> | null = null;

  for (let pageNumber = 0; pageNumber < maxPages; pageNumber += 1) {
    const page = await fetchSecurityAdvisoryUpdates({
      ...filters,
      limit: pageLimit,
      fromId: cursor,
    });
    firstResult ??= page;

    for (const update of page.data) {
      const id = numericSecurityAdvisoryUpdateId(update);
      if (id !== undefined) {
        if (seenIds.has(id)) continue;
        seenIds.add(id);
      }
      data.push(update);
    }

    if (page.data.length < pageLimit) return { ...firstResult, data };

    let nextCursor: number | undefined;
    for (let index = page.data.length - 1; index >= 0; index -= 1) {
      nextCursor = numericSecurityAdvisoryUpdateId(page.data[index]);
      if (nextCursor !== undefined) break;
    }

    if (nextCursor === undefined || seenCursors.has(nextCursor)) {
      throw new Error('Security advisory update pagination stalled before the history was complete');
    }
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }

  throw new Error('Security advisory update pagination exceeded its safety limit');
}

export async function fetchSecurityAdvisoryUpdate(
  securityAdvisoryUpdateId: number,
  opts?: { includes?: string; signal?: AbortSignal },
) {
  return haveApiCall<SecurityAdvisoryUpdate>({
    method: 'GET',
    path: `/security_advisory_updates/${securityAdvisoryUpdateId}`,
    meta: opts?.includes ? { includes: opts.includes } : undefined,
    signal: opts?.signal,
  });
}

export async function createSecurityAdvisoryUpdate(params: SecurityAdvisoryUpdateCreatePayload) {
  return haveApiCall<SecurityAdvisoryUpdate>({
    method: 'POST',
    path: '/security_advisory_updates',
    namespace: 'security_advisory_update',
    params: { ...params },
  });
}

export async function updateSecurityAdvisoryUpdate(
  securityAdvisoryUpdateId: number,
  params: SecurityAdvisoryUpdateTextPayload,
) {
  return haveApiCall<SecurityAdvisoryUpdate>({
    method: 'PUT',
    path: `/security_advisory_updates/${securityAdvisoryUpdateId}`,
    namespace: 'security_advisory_update',
    params: { ...params },
  });
}

export async function deleteSecurityAdvisoryUpdate(securityAdvisoryUpdateId: number) {
  return haveApiCall<null>({
    method: 'DELETE',
    path: `/security_advisory_updates/${securityAdvisoryUpdateId}`,
  });
}
