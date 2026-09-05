import { fetchUserPayments, type UserPayment } from './payments';
import { fetchUsers, type User } from './users';

/**
 * Keep compatibility scans responsive and independent of a server-specific
 * maximum `limit`. A caller can request a smaller batch (mostly useful for
 * tests), but never a larger one.
 */
export const FINANCE_SCAN_BATCH_SIZE = 250;
export const FINANCE_SCAN_MAX_ROWS = 10_000;

export type FinanceScanIncompleteReason = 'scan_limit' | 'cursor_stalled';

export interface FinanceScanResult<T> {
  rows: T[];
  /** Cursor after the last raw row inspected. Pass it to the next call. */
  nextFromId?: number;
  /** True only when the end of the server-side result set was observed. */
  complete: boolean;
  /** Number of raw rows inspected, including rows rejected by local filters. */
  scannedRows: number;
  batches: number;
  /**
   * Set when a safety boundary, rather than a normal UI page boundary, stopped
   * the scan. Consumers must not present totals from such a result as global.
   */
  incompleteReason?: FinanceScanIncompleteReason;
}

export interface FinancePaymentHistoryResult extends FinanceScanResult<UserPayment> {
  /** Rows with a missing or malformed `created_at`, rejected by a date filter. */
  invalidCreatedAtRows: number;
}

export interface FetchFinancePaymentHistoryPageOptions {
  limit?: number;
  fromId?: number;
  userId?: number;
  accountedById?: number;
  /** Inclusive timestamp boundary. A YYYY-MM-DD value starts at 00:00 UTC. */
  createdFrom?: string | Date;
  /** Inclusive timestamp boundary. A YYYY-MM-DD value covers that whole UTC day. */
  createdTo?: string | Date;
  signal?: AbortSignal;
}

export interface FetchFinanceUsersSnapshotOptions {
  /** Maximum number of users returned by this call. */
  scanLimit?: number;
  /** Raw request size, clamped to `FINANCE_SCAN_BATCH_SIZE`. */
  batchSize?: number;
  signal?: AbortSignal;
}

const DEFAULT_HISTORY_PAGE_SIZE = 50;
const MAX_HISTORY_PAGE_SIZE = 100;

function positiveInteger(value: number | undefined, fallback: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(Math.floor(value), maximum);
}

function normalizeScanLimit(value: number | undefined): number {
  return positiveInteger(value, FINANCE_SCAN_MAX_ROWS, FINANCE_SCAN_MAX_ROWS);
}

function normalizeBatchSize(value: number | undefined): number {
  return positiveInteger(value, FINANCE_SCAN_BATCH_SIZE, FINANCE_SCAN_BATCH_SIZE);
}

const UTC_DAY_MS = 86_400_000;

function timestamp(
  value: string | Date | undefined,
  label: string,
  dateOnlyEndOfDay = false,
): number | undefined {
  if (value === undefined) return undefined;
  const normalized = typeof value === 'string' ? value.trim() : value;
  if (typeof normalized === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const parsedDate = Date.parse(`${normalized}T00:00:00.000Z`);
    if (!Number.isFinite(parsedDate) || new Date(parsedDate).toISOString().slice(0, 10) !== normalized) {
      throw new Error(`finance: invalid ${label}`);
    }
    return dateOnlyEndOfDay ? parsedDate + UTC_DAY_MS - 1 : parsedDate;
  }

  const parsed = normalized instanceof Date ? normalized.getTime() : Date.parse(normalized);
  if (!Number.isFinite(parsed)) throw new Error(`finance: invalid ${label}`);
  return parsed;
}

interface CreatedAtBounds {
  from?: number;
  to?: number;
}

function normalizeCreatedAtBounds(
  createdFrom: string | Date | undefined,
  createdTo: string | Date | undefined,
): CreatedAtBounds {
  const from = timestamp(createdFrom, 'createdFrom');
  const to = timestamp(createdTo, 'createdTo', true);
  if (from !== undefined && to !== undefined && from > to) {
    throw new Error('finance: createdFrom must not be after createdTo');
  }
  return { from, to };
}

function matchesCreatedAt(payment: UserPayment, bounds: CreatedAtBounds): boolean | null {
  if (bounds.from === undefined && bounds.to === undefined) return true;

  const value = typeof payment.created_at === 'string' ? Date.parse(payment.created_at) : Number.NaN;
  if (!Number.isFinite(value)) return null;
  if (bounds.from !== undefined && value < bounds.from) return false;
  if (bounds.to !== undefined && value > bounds.to) return false;
  return true;
}

function validNextCursor(candidate: number | undefined, previous: number | undefined): number | undefined {
  if (!Number.isSafeInteger(candidate) || candidate === previous) return undefined;
  return candidate;
}

export class FinancePeriodFilterUnsupportedError extends Error {
  constructor() {
    super('The payment API did not apply the requested creation-period filter.');
    this.name = 'FinancePeriodFilterUnsupportedError';
  }
}

/**
 * Load one server-filtered global payment-history page. The API is asked for
 * one extra row so `nextFromId` is exposed only when a following page exists.
 * A response outside the requested period fails closed: older API versions
 * silently ignore unknown parameters and must never look like valid results.
 */
export async function fetchFinancePaymentHistoryPage(
  options: FetchFinancePaymentHistoryPageOptions = {},
): Promise<FinancePaymentHistoryResult> {
  const limit = positiveInteger(options.limit, DEFAULT_HISTORY_PAGE_SIZE, MAX_HISTORY_PAGE_SIZE);
  const bounds = normalizeCreatedAtBounds(options.createdFrom, options.createdTo);
  const hasLocalDateFilter = bounds.from !== undefined || bounds.to !== undefined;
  const requestLimit = limit + 1;
  const result = await fetchUserPayments({
    limit: requestLimit,
    fromId: options.fromId,
    userId: options.userId,
    accountedById: options.accountedById,
    createdFrom: bounds.from === undefined ? undefined : new Date(bounds.from).toISOString(),
    createdTo: bounds.to === undefined ? undefined : new Date(bounds.to).toISOString(),
    signal: options.signal,
  });

  const matchingRows: UserPayment[] = [];
  let invalidCreatedAtRows = 0;
  let serverFilterMismatch = false;

  for (const payment of result.data) {
    const dateMatch = matchesCreatedAt(payment, bounds);
    if (dateMatch === null) {
      invalidCreatedAtRows += 1;
      continue;
    }
    if (!dateMatch) {
      serverFilterMismatch = true;
      continue;
    }
    matchingRows.push(payment);
  }

  if (hasLocalDateFilter && serverFilterMismatch) {
    throw new FinancePeriodFilterUnsupportedError();
  }

  const rows = matchingRows.slice(0, limit);
  const sourceMayContinue = result.data.length >= requestLimit;
  if (!sourceMayContinue) {
    return {
      rows,
      complete: true,
      scannedRows: result.data.length,
      batches: 1,
      invalidCreatedAtRows,
    };
  }

  const cursorCandidate = matchingRows.length > limit
    ? rows.at(-1)?.id
    : result.data.at(-1)?.id;
  const nextFromId = validNextCursor(cursorCandidate, options.fromId);
  if (nextFromId === undefined) {
    return {
      rows,
      complete: false,
      scannedRows: result.data.length,
      batches: 1,
      invalidCreatedAtRows,
      incompleteReason: 'cursor_stalled',
    };
  }

  return {
    rows,
    nextFromId,
    complete: false,
    scannedRows: result.data.length,
    batches: 1,
    invalidCreatedAtRows,
  };
}

/**
 * Load a bounded, point-in-time user snapshot for global finance KPIs.
 * `complete` must be true before the snapshot is used for global totals.
 */
export async function fetchFinanceUsersSnapshot(
  options: FetchFinanceUsersSnapshotOptions = {},
): Promise<FinanceScanResult<User>> {
  const scanLimit = normalizeScanLimit(options.scanLimit);
  const batchSize = normalizeBatchSize(options.batchSize);
  const rows: User[] = [];
  const seenIds = new Set<number>();
  const seenCursors = new Set<number>();
  const objectStates = ['active', 'suspended'] as const;
  let objectStateIndex = 0;
  let cursor: number | undefined;
  let scannedRows = 0;
  let batches = 0;

  while (scannedRows < scanLimit) {
    const requestLimit = Math.min(batchSize, scanLimit - scannedRows);
    const result = await fetchUsers({
      limit: requestLimit,
      fromId: cursor,
      objectState: objectStates[objectStateIndex],
      signal: options.signal,
    });
    batches += 1;

    if (result.data.length === 0) {
      objectStateIndex += 1;
      if (objectStateIndex >= objectStates.length) {
        return { rows, complete: true, scannedRows, batches };
      }
      cursor = undefined;
      continue;
    }

    let lastInspectedId: number | undefined;
    for (const user of result.data) {
      if (scannedRows >= scanLimit) break;
      scannedRows += 1;
      if (Number.isSafeInteger(user.id)) lastInspectedId = user.id;
      if (seenIds.has(user.id)) continue;
      seenIds.add(user.id);
      rows.push(user);
    }

    if (result.data.length < requestLimit) {
      objectStateIndex += 1;
      if (objectStateIndex >= objectStates.length) {
        return { rows, complete: true, scannedRows, batches };
      }
      cursor = undefined;
      continue;
    }

    const nextCursor = validNextCursor(lastInspectedId, cursor);
    if (nextCursor === undefined || seenCursors.has(nextCursor)) {
      return {
        rows,
        complete: false,
        scannedRows,
        batches,
        incompleteReason: 'cursor_stalled',
      };
    }

    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }

  return {
    rows,
    nextFromId: cursor,
    complete: false,
    scannedRows,
    batches,
    incompleteReason: 'scan_limit',
  };
}
