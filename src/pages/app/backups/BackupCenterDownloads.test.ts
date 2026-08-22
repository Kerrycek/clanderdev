import { describe, expect, it, vi } from 'vitest';

import type { Dataset, SnapshotDownload } from '../../../lib/api/datasets';
import {
  fetchAllBackupDatasets,
  fetchAuthorizedSnapshotDownloads,
  fetchOwnDatasetDownloads,
  type DatasetsFetcher,
  type SnapshotDownloadsFetcher,
} from './BackupCenterDownloads';

function descendingPage<T extends { id: number }>(
  rows: T[],
  fromId: number | undefined,
  limit: number,
): T[] {
  return rows
    .filter((row) => fromId === undefined || row.id < fromId)
    .slice(0, limit);
}

function dataset(id: number): Dataset {
  return { id, name: `dataset-${id}` };
}

describe('BackupCenterDownloads', () => {
  it('loads every owned dataset beyond the first API page', async () => {
    const rows = Array.from({ length: 151 }, (_, index) => dataset(500 - index));
    const fetcherMock = vi.fn(async (options) => ({
      data: descendingPage(rows, options?.fromId, options?.limit ?? 100),
      meta: { total_count: rows.length },
    }));

    const result = await fetchAllBackupDatasets({
      fetcher: fetcherMock as DatasetsFetcher,
      user: 42,
      includes: 'vps,parent',
      limit: 100,
    });

    expect(result.data).toHaveLength(151);
    expect(result.totalCount).toBe(151);
    expect(result.complete).toBe(true);
    expect(fetcherMock).toHaveBeenCalledTimes(2);
    expect(fetcherMock.mock.calls[0]?.[0]).toMatchObject({
      user: 42,
      includes: 'vps,parent',
      limit: 100,
      count: true,
    });
    expect(fetcherMock.mock.calls[1]?.[0]).toMatchObject({
      fromId: 401,
      count: false,
    });
  });

  it('loads every globally authorized user download beyond the first API page', async () => {
    const rows: SnapshotDownload[] = Array.from({ length: 151 }, (_, index) => ({
      id: 900 - index,
      state: 'ready',
    }));
    const fetcherMock = vi.fn(async (options) => ({
      data: descendingPage(rows, options?.fromId, options?.limit ?? 100),
      meta: { total_count: rows.length },
    }));

    const result = await fetchAuthorizedSnapshotDownloads({
      fetcher: fetcherMock as SnapshotDownloadsFetcher,
      limit: 100,
    });

    expect(result.data).toHaveLength(151);
    expect(result.totalCount).toBe(151);
    expect(result.complete).toBe(true);
    expect(fetcherMock).toHaveBeenCalledTimes(2);
    expect(fetcherMock.mock.calls.every(([options]) => options?.dataset === undefined)).toBe(true);
    expect(fetcherMock.mock.calls[1]?.[0]).toMatchObject({ fromId: 801, count: false });
  });

  it('loads every download for an owned dataset beyond the first API page', async () => {
    const rows: SnapshotDownload[] = Array.from({ length: 151 }, (_, index) => ({
      id: 700 - index,
      snapshot: { id: 1_000 + index, dataset: { id: 10 } },
    }));
    const fetcherMock = vi.fn(async (options) => ({
      data: descendingPage(rows, options?.fromId, options?.limit ?? 100),
      meta: { total_count: rows.length },
    }));

    const result = await fetchOwnDatasetDownloads([dataset(10)], {
      fetcher: fetcherMock as SnapshotDownloadsFetcher,
      limit: 100,
    });

    expect(result.data).toHaveLength(151);
    expect(result.complete).toBe(true);
    expect(result.failedDatasetIds).toEqual([]);
    expect(fetcherMock).toHaveBeenCalledTimes(2);
    expect(fetcherMock.mock.calls[1]?.[0]).toMatchObject({
      dataset: 10,
      fromId: 601,
      count: false,
    });
  });

  it('bounds the admin My-view fan-out and de-duplicates datasets', async () => {
    let active = 0;
    let maxActive = 0;
    const fetcherMock = vi.fn(async (options) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      const datasetId = Number(options?.dataset);
      return {
        data: [{ id: 100 + datasetId, snapshot: { id: 200 + datasetId, dataset: { id: datasetId } } }],
        meta: { total_count: 1 },
      };
    });

    const result = await fetchOwnDatasetDownloads(
      [dataset(1), dataset(2), dataset(3), dataset(2)],
      { fetcher: fetcherMock as SnapshotDownloadsFetcher, concurrency: 2 },
    );

    expect(fetcherMock).toHaveBeenCalledTimes(3);
    expect(maxActive).toBeLessThanOrEqual(2);
    expect(result.data.map((row) => row.id)).toEqual([103, 102, 101]);
    expect(result.complete).toBe(true);
  });

  it('fails closed when a scoped response omits or mismatches the dataset relation', async () => {
    const fetcherMock = vi.fn(async () => ({
      data: [
        { id: 12, snapshot: { id: 102, dataset: { id: 99 } } },
        { id: 11, snapshot: { id: 101 } },
        { id: 10, snapshot: { id: 100, dataset: { id: 1 } } },
      ],
      meta: { total_count: 3 },
    }));

    const result = await fetchOwnDatasetDownloads([dataset(1)], {
      fetcher: fetcherMock as SnapshotDownloadsFetcher,
    });

    expect(result.data.map((row) => row.id)).toEqual([10]);
    expect(result.failedDatasetIds).toEqual([1]);
    expect(result.complete).toBe(false);
  });

  it('keeps successful scoped rows when another dataset request fails', async () => {
    const fetcherMock = vi.fn(async (options) => {
      const datasetId = Number(options?.dataset);
      if (datasetId === 2) throw new Error('temporary failure');
      return {
        data: [{ id: 101, snapshot: { id: 201, dataset: { id: 1 } } }],
        meta: { total_count: 1 },
      };
    });

    const result = await fetchOwnDatasetDownloads([dataset(1), dataset(2)], {
      fetcher: fetcherMock as SnapshotDownloadsFetcher,
    });

    expect(result.data.map((row) => row.id)).toEqual([101]);
    expect(result.failedDatasetIds).toEqual([2]);
    expect(result.complete).toBe(false);
  });

  it('marks a capped traversal incomplete and counts only rows actually loaded', async () => {
    const rows = Array.from({ length: 250 }, (_, index) => dataset(1_000 - index));
    const fetcherMock = vi.fn(async (options) => ({
      data: descendingPage(rows, options?.fromId, options?.limit ?? 100),
      meta: { total_count: rows.length },
    }));

    const result = await fetchAllBackupDatasets({
      fetcher: fetcherMock as DatasetsFetcher,
      limit: 100,
      maxPages: 1,
    });

    expect(result.data).toHaveLength(100);
    expect(result.totalCount).toBe(100);
    expect(result.complete).toBe(false);
  });
});
