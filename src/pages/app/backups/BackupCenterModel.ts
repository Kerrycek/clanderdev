import type { Dataset, ResourceRef, SnapshotDownload } from '../../../lib/api/datasets';
import {
  snapshotDownloadHref,
  snapshotDownloadStatus,
  type SnapshotDownloadHrefOptions,
} from '../datasets/DatasetDownloadModel';

export const BACKUP_CENTER_TABS = ['overview', 'snapshots', 'downloads', 'plans'] as const;
export type BackupCenterTab = (typeof BACKUP_CENTER_TABS)[number];

export function parseBackupCenterTab(value: string | null | undefined): BackupCenterTab {
  return BACKUP_CENTER_TABS.includes(value as BackupCenterTab)
    ? (value as BackupCenterTab)
    : 'overview';
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
}

function positiveNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return undefined;
}

export function resourceLabel(value: unknown, fallback = '—'): string {
  const row = record(value);
  if (!row) return fallback;
  for (const key of ['label', 'full_name', 'hostname', 'name', 'login']) {
    const candidate = row[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return positiveNumber(row['id']) !== undefined ? `#${String(row['id'])}` : fallback;
}

export function datasetBackupLabel(dataset: Dataset): string {
  return String(dataset.label ?? dataset.full_name ?? dataset.name ?? `#${dataset.id}`);
}

export function datasetBackupKind(dataset: Dataset): 'vps' | 'nas' {
  return record(dataset.vps) ? 'vps' : 'nas';
}

export function datasetBackupPath(dataset: Dataset, section?: 'snapshots' | 'downloads' | 'plans'): string {
  const root = datasetBackupKind(dataset) === 'vps' ? '/app/datasets' : '/app/nas';
  return `${root}/${dataset.id}${section ? `/${section}` : ''}`;
}

export function filterBackupDatasets(datasets: Dataset[], query: string): Dataset[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return datasets;
  return datasets.filter((dataset) => {
    const haystack = [
      dataset.id,
      dataset.name,
      dataset.full_name,
      dataset.label,
      resourceLabel(dataset.vps, ''),
    ]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase();
    return haystack.includes(needle);
  });
}

export function snapshotDownloadDataset(download: SnapshotDownload): ResourceRef | undefined {
  const direct = record(download['dataset']);
  if (direct && positiveNumber(direct['id']) !== undefined) return direct as ResourceRef;
  const nested = record(record(download.snapshot)?.['dataset']);
  if (nested && positiveNumber(nested['id']) !== undefined) return nested as ResourceRef;
  return undefined;
}

export function resolveSnapshotDownloadDataset(
  download: SnapshotDownload,
  datasets: Dataset[],
): Dataset | ResourceRef | undefined {
  const referenced = snapshotDownloadDataset(download);
  const referencedId = positiveNumber(referenced?.id);
  if (referencedId === undefined) return undefined;
  return datasets.find((dataset) => Number(dataset.id) === referencedId) ?? referenced;
}

export function snapshotDownloadDatasetPath(
  download: SnapshotDownload,
  knownDataset?: Dataset | ResourceRef,
): string | undefined {
  const dataset = knownDataset ?? snapshotDownloadDataset(download);
  if (!dataset) return undefined;
  const id = positiveNumber(dataset.id);
  if (id === undefined) return undefined;
  const kind = record(dataset['vps']) || dataset['role'] === 'hypervisor' ? 'datasets' : 'nas';
  return `/app/${kind}/${id}/downloads`;
}

export function summarizeBackupCenter(
  datasets: Dataset[],
  downloads: SnapshotDownload[],
  hrefOptions: SnapshotDownloadHrefOptions = {},
) {
  let readyDownloads = 0;
  let pendingDownloads = 0;
  let unavailableDownloads = 0;
  for (const download of downloads) {
    const href = snapshotDownloadHref(download, hrefOptions);
    const status = snapshotDownloadStatus(download, { href });
    if (status === 'ready') readyDownloads += 1;
    else if (status === 'pending') pendingDownloads += 1;
    else unavailableDownloads += 1;
  }

  return {
    datasets: datasets.length,
    downloads: downloads.length,
    readyDownloads,
    pendingDownloads,
    unavailableDownloads,
  };
}
