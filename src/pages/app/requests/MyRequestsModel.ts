import { getMetaTotalCount } from '../../../lib/api/haveapi';
import {
  fetchMyChangeRequests,
  fetchMyRegistrationRequests,
  type ChangeRequest,
  type MyRequestListOptions,
  type RegistrationRequest,
  type UserRequestCommon,
} from '../../../lib/api/requests';
import {
  changeRows,
  registrationRows,
  requestDateValue,
  requestId,
  requestType,
  type UnifiedRequestRow,
} from '../admin/RequestsModel';

export type MyRequestsType = 'all' | 'registration' | 'change';

export interface MyRequestsCursor {
  registration: number | null;
  change: number | null;
}

export interface MyRequestsPageResult {
  rows: UnifiedRequestRow[];
  nextCursor: MyRequestsCursor | null;
  canNext: boolean;
  totalCount?: number;
}

interface OwnedRequestPage<T extends UserRequestCommon> {
  data: T[];
  meta?: Record<string, unknown>;
}

export interface MyRequestsPageFetchers {
  registrations: (
    expectedUserId: number,
    options: MyRequestListOptions,
  ) => Promise<OwnedRequestPage<RegistrationRequest>>;
  changes: (
    expectedUserId: number,
    options: MyRequestListOptions,
  ) => Promise<OwnedRequestPage<ChangeRequest>>;
}

export const EMPTY_MY_REQUESTS_CURSOR: MyRequestsCursor = {
  registration: null,
  change: null,
};

const defaultFetchers: MyRequestsPageFetchers = {
  registrations: fetchMyRegistrationRequests,
  changes: fetchMyChangeRequests,
};

function timestamp(request: UnifiedRequestRow): number {
  const raw = requestDateValue(request, 'created_at') || requestDateValue(request, 'updated_at');
  if (!raw) return 0;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareNewestFirst(a: UnifiedRequestRow, b: UnifiedRequestRow): number {
  const byTimestamp = timestamp(b) - timestamp(a);
  if (byTimestamp !== 0) return byTimestamp;
  const byId = requestId(b) - requestId(a);
  if (byId !== 0) return byId;
  return requestType(a).localeCompare(requestType(b));
}

/**
 * Merge only the head of each server-ordered stream. Advancing a keyset cursor
 * is safe only for a consumed prefix; sorting the entire fetched window could
 * consume a lower ID before an earlier row and then skip that earlier row.
 */
function mergeSourcePrefixes(
  registrations: UnifiedRequestRow[],
  changes: UnifiedRequestRow[],
  limit: number,
): UnifiedRequestRow[] {
  const rows: UnifiedRequestRow[] = [];
  let registrationIndex = 0;
  let changeIndex = 0;

  while (
    rows.length < limit &&
    (registrationIndex < registrations.length || changeIndex < changes.length)
  ) {
    const registration = registrations[registrationIndex];
    const change = changes[changeIndex];

    if (!change || (registration && compareNewestFirst(registration, change) <= 0)) {
      rows.push(registration as UnifiedRequestRow);
      registrationIndex += 1;
    } else {
      rows.push(change);
      changeIndex += 1;
    }
  }

  return rows;
}

function normalizeSource<T extends UserRequestCommon>(
  rows: T[],
  fromId: number | null,
): T[] {
  const seen = new Set<number>();
  const normalized: T[] = [];

  for (const row of rows) {
    const id = Number(row.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new Error('Request page contains an invalid ID.');
    }

    // HaveAPI's descending keyset is exclusive. Be defensive if a proxy or
    // fixture repeats the cursor row: duplicates must not cross page borders.
    if (fromId !== null && id >= fromId) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    normalized.push(row);
  }

  return normalized;
}

function consumedCursor(
  rows: UnifiedRequestRow[],
  type: 'registration' | 'change',
  current: number | null,
): number | null {
  const ids = rows
    .filter((row) => requestType(row) === type)
    .map(requestId);
  return ids.length > 0 ? Math.min(...ids) : current;
}

/**
 * Fetch exactly one owner-scoped page.
 *
 * Registration and change requests are independent keyset streams. Each page
 * therefore keeps a cursor for both streams, fetches at most once from each
 * enabled endpoint and only advances a stream past rows that were actually
 * rendered. Rows fetched past the merge boundary are fetched again on the next
 * page, so they are neither skipped nor duplicated in the UI.
 */
export async function fetchMyRequestsPage(
  options: {
    userId: number;
    type: MyRequestsType;
    state?: string;
    limit: number;
    cursor?: MyRequestsCursor;
    consumedBefore?: number;
  },
  fetchers: MyRequestsPageFetchers = defaultFetchers,
): Promise<MyRequestsPageResult> {
  if (!Number.isSafeInteger(options.userId) || options.userId <= 0) {
    throw new Error('Authenticated user identity is unavailable.');
  }

  const limit = Math.max(1, Math.min(100, Math.floor(options.limit)));
  const cursor = options.cursor ?? EMPTY_MY_REQUESTS_CURSOR;
  const needRegistrations = options.type === 'all' || options.type === 'registration';
  const needChanges = options.type === 'all' || options.type === 'change';
  const pageOptions = (fromId: number | null): MyRequestListOptions => ({
    limit,
    fromId: fromId ?? undefined,
    state: options.state,
    count: true,
  });

  const [registrationPage, changePage] = await Promise.all([
    needRegistrations
      ? fetchers.registrations(options.userId, pageOptions(cursor.registration))
      : Promise.resolve<OwnedRequestPage<RegistrationRequest>>({ data: [] }),
    needChanges
      ? fetchers.changes(options.userId, pageOptions(cursor.change))
      : Promise.resolve<OwnedRequestPage<ChangeRequest>>({ data: [] }),
  ]);

  const registrations = registrationRows(
    normalizeSource(registrationPage.data, cursor.registration),
  ).sort((a, b) => requestId(b) - requestId(a));
  const changes = changeRows(
    normalizeSource(changePage.data, cursor.change),
  ).sort((a, b) => requestId(b) - requestId(a));
  const rows = mergeSourcePrefixes(registrations, changes, limit);

  const registrationTotal = needRegistrations ? getMetaTotalCount(registrationPage.meta) : 0;
  const changeTotal = needChanges ? getMetaTotalCount(changePage.meta) : 0;
  const totalCount = registrationTotal !== undefined && changeTotal !== undefined
    ? registrationTotal + changeTotal
    : undefined;
  const consumedAfter = Math.max(0, Math.floor(options.consumedBefore ?? 0)) + rows.length;
  const sourceMayContinue = (
    (needRegistrations && registrationPage.data.length >= limit) ||
    (needChanges && changePage.data.length >= limit)
  );
  const canNext = rows.length > 0 && (
    totalCount !== undefined
      ? consumedAfter < totalCount
      : registrations.length + changes.length > rows.length || sourceMayContinue
  );

  if (!canNext) {
    return { rows, nextCursor: null, canNext: false, totalCount };
  }

  const nextCursor: MyRequestsCursor = {
    registration: consumedCursor(rows, 'registration', cursor.registration),
    change: consumedCursor(rows, 'change', cursor.change),
  };
  const advanced = nextCursor.registration !== cursor.registration || nextCursor.change !== cursor.change;

  return {
    rows,
    nextCursor: advanced ? nextCursor : null,
    canNext: advanced,
    totalCount,
  };
}
