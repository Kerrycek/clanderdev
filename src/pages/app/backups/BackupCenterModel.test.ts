import { describe, expect, it } from 'vitest';

import type { Dataset, SnapshotDownload } from '../../../lib/api/datasets';
import {
  datasetBackupKind,
  datasetBackupPath,
  filterBackupDatasets,
  parseBackupCenterTab,
  resolveSnapshotDownloadDataset,
  snapshotDownloadDatasetPath,
  summarizeBackupCenter,
} from './BackupCenterModel';

describe('BackupCenterModel', () => {
  const vpsDataset = {
    id: 10,
    name: 'root',
    full_name: 'mail.example/root',
    vps: { id: 20, hostname: 'mail.example' },
  } satisfies Dataset;
  const nasDataset = { id: 11, name: 'archive' } satisfies Dataset;

  it('keeps invalid tab values on the safe overview tab', () => {
    expect(parseBackupCenterTab('downloads')).toBe('downloads');
    expect(parseBackupCenterTab('other')).toBe('overview');
  });

  it('routes VPS and NAS datasets to their existing detail tools', () => {
    expect(datasetBackupKind(vpsDataset)).toBe('vps');
    expect(datasetBackupPath(vpsDataset, 'snapshots')).toBe('/app/datasets/10/snapshots');
    expect(datasetBackupKind(nasDataset)).toBe('nas');
    expect(datasetBackupPath(nasDataset, 'plans')).toBe('/app/nas/11/plans');
  });

  it('filters by dataset, id and VPS label without extra API requests', () => {
    expect(filterBackupDatasets([vpsDataset, nasDataset], 'mail')).toEqual([vpsDataset]);
    expect(filterBackupDatasets([vpsDataset, nasDataset], '11')).toEqual([nasDataset]);
  });

  it('resolves a download back to its dataset when includes are available', () => {
    const download = {
      id: 1,
      snapshot: { id: 9, dataset: { id: 10, vps: { id: 20 } } },
    } as SnapshotDownload;
    expect(snapshotDownloadDatasetPath(download)).toBe('/app/datasets/10/downloads');
    expect(resolveSnapshotDownloadDataset(download, [vpsDataset, nasDataset])).toBe(vpsDataset);
  });

  it('uses the known owned dataset to build a reliable download detail path', () => {
    const download = {
      id: 2,
      snapshot: { id: 10, dataset: { id: 11 } },
    } as SnapshotDownload;

    const dataset = resolveSnapshotDownloadDataset(download, [vpsDataset, nasDataset]);
    expect(snapshotDownloadDatasetPath(download, dataset)).toBe('/app/nas/11/downloads');
  });

  it('summarizes only values supported by the index responses', () => {
    const summary = summarizeBackupCenter(
      [vpsDataset, nasDataset],
      [
        { id: 1, state: 'ready', url: '/download/1' },
        { id: 2, state: 'pending' },
        { id: 3, state: 'failed' },
      ] as SnapshotDownload[],
    );
    expect(summary).toMatchObject({
      datasets: 2,
      downloads: 3,
      readyDownloads: 1,
      pendingDownloads: 1,
      unavailableDownloads: 1,
    });
  });
});
