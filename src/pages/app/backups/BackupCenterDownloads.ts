import {
  fetchDatasets,
  fetchSnapshotDownloads,
  type Dataset,
  type SnapshotDownload,
} from '../../../lib/api/datasets';
import { getMetaTotalCount } from '../../../lib/api/haveapi';
import { cursorFromDescendingPage } from '../../../lib/lockIndex';

const DEFAULT_PAGE_LIMIT = 100;
const DEFAULT_MAX_PAGES = 10_000;
const DEFAULT_CONCURRENCY = 4;

export interface BackupCenterDatasetsResult {
  data: Dataset[];
  totalCount: number;
  complete: boolean;
}

export interface BackupCenterDownloadsResult {
  data: SnapshotDownload[];
  totalCount: number;
  complete: boolean;
  failedDatasetIds: number[];
}

export type DatasetsFetcher = (
  options?: Parameters<typeof fetchDatasets>[0],
) => Promise<Pick<Awaited<ReturnType<typeof fetchDatasets>>, 'data' | 'meta'>>;
export type SnapshotDownloadsFetcher = (
  options?: Parameters<typeof fetchSnapshotDownloads>[0],
) => Promise<Pick<Awaited<ReturnType<typeof fetchSnapshotDownloads>>, 'data' | 'meta'>>;

interface KeysetRow {
  id: number;
}

interface KeysetPage<T extends KeysetRow> {
  data: T[];
  meta?: unknown;
}

interface KeysetCollection<T extends KeysetRow> {
  data: T[];
  complete: boolean;
  expectedTotal?: number;
  rejectedRows: number;
}

function positiveId(value: unknown): number | undefined {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : undefined;
}

function positiveDatasetId(dataset: Dataset): number | undefined {
  return positiveId(dataset.id);
}

function newestFirst<T extends KeysetRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => Number(b.id) - Number(a.id));
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? value as Record<string, unknown> : undefined;
}

function resourceId(value: unknown): number | undefined {
  const row = record(value);
  return positiveId(row?.['id'] ?? value);
}

function explicitDatasetIds(download: SnapshotDownload): number[] {
  const snapshot = record(download.snapshot);
  return [resourceId(download['dataset']), resourceId(snapshot?.['dataset'])]
    .filter((id): id is number => id !== undefined);
}

function belongsToDataset(download: SnapshotDownload, datasetId: number): boolean {
  const ids = explicitDatasetIds(download);
  return ids.length > 0 && ids.every((id) => id === datasetId);
}

function attachDataset(download: SnapshotDownload, dataset: Dataset): SnapshotDownload {
  return { ...download, dataset };
}

async function collectKeysetRows<T extends KeysetRow>(
  fetchPage: (options: { limit: number; fromId?: number; count: boolean }) => Promise<KeysetPage<T>>,
  options: {
    limit: number;
    maxPages: number;
    accept?: (row: T) => boolean;
  },
): Promise<KeysetCollection<T>> {
  const rows = new Map<number, T>();
  const seenCursors = new Set<number>();
  let cursor: number | undefined;
  let expectedTotal: number | undefined;
  let rejectedRows = 0;
  let loadedPages = 0;

  for (let pageNumber = 0; pageNumber < options.maxPages; pageNumber += 1) {
    let page: KeysetPage<T>;
    try {
      page = await fetchPage({
        limit: options.limit,
        fromId: cursor,
        count: pageNumber === 0,
      });
    } catch (error) {
      if (loadedPages === 0) throw error;
      return { data: [...rows.values()], complete: false, expectedTotal, rejectedRows };
    }
    loadedPages += 1;
    expectedTotal ??= getMetaTotalCount(page.meta);

    for (const row of page.data) {
      const id = positiveId(row.id);
      if (id === undefined || (options.accept && !options.accept(row))) {
        rejectedRows += 1;
        continue;
      }
      rows.set(id, row);
    }

    const hasRejectedRows = rejectedRows > 0;
    if (!hasRejectedRows && expectedTotal !== undefined && rows.size >= expectedTotal) {
      return { data: [...rows.values()], complete: true, expectedTotal, rejectedRows };
    }

    if (page.data.length < options.limit) {
      const reachedExpectedTotal = expectedTotal === undefined || rows.size >= expectedTotal;
      return {
        data: [...rows.values()],
        complete: !hasRejectedRows && reachedExpectedTotal,
        expectedTotal,
        rejectedRows,
      };
    }

    const nextCursor = cursorFromDescendingPage(page.data) ?? undefined;
    if (nextCursor === undefined || seenCursors.has(nextCursor)) {
      return { data: [...rows.values()], complete: false, expectedTotal, rejectedRows };
    }
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }

  return { data: [...rows.values()], complete: false, expectedTotal, rejectedRows };
}

export async function fetchAllBackupDatasets(options: {
  fetcher?: DatasetsFetcher;
  user?: number;
  includes?: string;
  limit?: number;
  maxPages?: number;
} = {}): Promise<BackupCenterDatasetsResult> {
  const fetcher = options.fetcher ?? fetchDatasets;
  const limit = Math.max(2, Math.floor(options.limit ?? DEFAULT_PAGE_LIMIT));
  const maxPages = Math.max(1, Math.floor(options.maxPages ?? DEFAULT_MAX_PAGES));
  const result = await collectKeysetRows<Dataset>(
    ({ fromId, count }) => fetcher({
      limit,
      ...(fromId === undefined ? {} : { fromId }),
      includes: options.includes,
      user: options.user,
      count,
    }),
    { limit, maxPages },
  );
  const data = newestFirst(result.data);
  return {
    data,
    totalCount: data.length,
    complete: result.complete,
  };
}

export async function fetchAuthorizedSnapshotDownloads(options: {
  fetcher?: SnapshotDownloadsFetcher;
  limit?: number;
  maxPages?: number;
} = {}): Promise<BackupCenterDownloadsResult> {
  const fetcher = options.fetcher ?? fetchSnapshotDownloads;
  const limit = Math.max(2, Math.floor(options.limit ?? DEFAULT_PAGE_LIMIT));
  const maxPages = Math.max(1, Math.floor(options.maxPages ?? DEFAULT_MAX_PAGES));
  const result = await collectKeysetRows<SnapshotDownload>(
    ({ fromId, count }) => fetcher({
      limit,
      ...(fromId === undefined ? {} : { fromId }),
      includes: 'snapshot__dataset',
      count,
    }),
    { limit, maxPages },
  );
  const data = newestFirst(result.data);
  return {
    data,
    totalCount: data.length,
    complete: result.complete,
    failedDatasetIds: [],
  };
}

/**
 * SnapshotDownload#index cannot filter by user for an administrator. In the
 * administrator's My view we therefore query every dataset ID returned by the
 * user-scoped Dataset#index. Rows without an explicit matching dataset
 * relation are rejected instead of being relabelled as owned data.
 */
export async function fetchOwnDatasetDownloads(
  datasets: Dataset[],
  options: {
    fetcher?: SnapshotDownloadsFetcher;
    limit?: number;
    maxPages?: number;
    concurrency?: number;
  } = {},
): Promise<BackupCenterDownloadsResult> {
  const fetcher = options.fetcher ?? fetchSnapshotDownloads;
  const limit = Math.max(2, Math.floor(options.limit ?? DEFAULT_PAGE_LIMIT));
  const maxPages = Math.max(1, Math.floor(options.maxPages ?? DEFAULT_MAX_PAGES));
  const concurrency = Math.max(1, Math.floor(options.concurrency ?? DEFAULT_CONCURRENCY));
  const uniqueDatasets = [...new Map(
    datasets
      .map((dataset) => [positiveDatasetId(dataset), dataset] as const)
      .filter((entry): entry is readonly [number, Dataset] => entry[0] !== undefined),
  ).values()];

  const downloads: SnapshotDownload[] = [];
  const failedDatasetIds = new Set<number>();
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < uniqueDatasets.length) {
      const dataset = uniqueDatasets[nextIndex++];
      if (!dataset) continue;
      const datasetId = Number(dataset.id);

      try {
        const result = await collectKeysetRows<SnapshotDownload>(
          ({ fromId, count }) => fetcher({
            dataset: datasetId,
            limit,
            ...(fromId === undefined ? {} : { fromId }),
            includes: 'snapshot__dataset',
            count,
          }),
          {
            limit,
            maxPages,
            accept: (download) => belongsToDataset(download, datasetId),
          },
        );
        if (!result.complete || result.rejectedRows > 0) failedDatasetIds.add(datasetId);
        downloads.push(...result.data.map((download) => attachDataset(download, dataset)));
      } catch {
        failedDatasetIds.add(datasetId);
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, uniqueDatasets.length) },
      () => worker(),
    ),
  );

  const uniqueDownloads = [...new Map(
    newestFirst(downloads).map((download) => [Number(download.id), download]),
  ).values()];

  return {
    data: uniqueDownloads,
    totalCount: uniqueDownloads.length,
    complete: failedDatasetIds.size === 0,
    failedDatasetIds: [...failedDatasetIds].sort((a, b) => a - b),
  };
}
