import { describe, expect, it } from 'vitest';

import type { Dataset, SnapshotDownload } from '../../../lib/api/datasets';
import {
  datasetBackupKind,
  datasetBackupPath,
  filterBackupDatasets,
  parseBackupCenterTab,
  snapshotDownloadDatasetPath,
  summarizeBackupCenter,
} from './BackupCenterModel';

describe('BackupCenterModel', () => {
  const vpsDataset = {
    id: 10,
    name: 'root',
    full_name: 'mail.example/root',
    vps: { id: 20, hostname: 'mail.example' },
    snapshots_count: 3,
  } satisfies Dataset;
  const nasDataset = { id: 11, name: 'archive', snapshots_count: 0 } satisfies Dataset;

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
  });

  it('summarizes snapshot counts and download readiness', () => {
    const summary = summarizeBackupCenter(
      [vpsDataset, nasDataset],
      [
        { id: 1, state: 'ready', url: '/download/1' },
        { id: 2, state: 'pending' },
      ] as SnapshotDownload[],
    );
    expect(summary).toMatchObject({
      datasets: 2,
      snapshots: 3,
      snapshotCountsComplete: true,
      datasetsWithoutSnapshots: 1,
      readyDownloads: 1,
      pendingDownloads: 1,
    });
  });
});
