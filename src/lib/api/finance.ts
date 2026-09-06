import { fetchUsers, type User } from './users';

/**
 * Keep compatibility scans responsive with a conservative request size. A
 * caller can request a smaller batch (mostly useful for tests), but never a
 * larger one.
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

export interface FetchFinanceUsersSnapshotOptions {
  /** Maximum number of users returned by this call. */
  scanLimit?: number;
  /** Raw request size, clamped to `FINANCE_SCAN_BATCH_SIZE`. */
  batchSize?: number;
  signal?: AbortSignal;
}

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

function validNextCursor(candidate: number | undefined, previous: number | undefined): number | undefined {
  if (typeof candidate !== 'number' || !Number.isSafeInteger(candidate)) return undefined;
  if (previous !== undefined && candidate <= previous) return undefined;
  return candidate;
}

/**
 * Load a bounded multi-request user snapshot for global finance KPIs.
 * The API does not offer an aggregate or transactionally consistent snapshot,
 * so rows can change while the active and suspended keyset scans are running.
 * `complete` must be true before the snapshot is used for global totals.
 */
export async function fetchFinanceUsersSnapshot(
  options: FetchFinanceUsersSnapshotOptions = {},
): Promise<FinanceScanResult<User>> {
  const scanLimit = normalizeScanLimit(options.scanLimit);
  const batchSize = normalizeBatchSize(options.batchSize);
  const rows: User[] = [];
  const seenIds = new Set<number>();
  const seenCursors = new Set<string>();
  const objectStates = ['active', 'suspended'] as const;
  let objectStateIndex = 0;
  let cursor: number | undefined;
  let scannedRows = 0;
  let batches = 0;

  while (scannedRows < scanLimit) {
    const requestLimit = Math.min(batchSize, scanLimit - scannedRows);
    const objectState = objectStates[objectStateIndex];
    const result = await fetchUsers({
      limit: requestLimit,
      fromId: cursor,
      objectState,
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
    const cursorKey = `${objectState}:${nextCursor}`;
    if (nextCursor === undefined || seenCursors.has(cursorKey)) {
      return {
        rows,
        complete: false,
        scannedRows,
        batches,
        incompleteReason: 'cursor_stalled',
      };
    }

    seenCursors.add(cursorKey);
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
