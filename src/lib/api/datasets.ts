import { expectArray, haveApiCall } from './haveapi';

/**
 * Datasets, snapshots and snapshot download links.
 */

export interface ResourceRef {
  id: number;
  [k: string]: unknown;
}

export interface Dataset {
  id: number;
  name: string;
  full_name?: string;
  label?: string;

  type?: string;
  pool?: string;

  user?: ResourceRef;
  vps?: ResourceRef;
  parent?: ResourceRef;

  // Space values are typically reported in MiB.
  used?: number;
  referenced?: number;
  avail?: number;
  quota?: number;
  refquota?: number;

  // Counts
  children_count?: number;
  snapshots_count?: number;
  mount_count?: number;
  export_count?: number;

  created_at?: string;
  updated_at?: string;

  object_state?: string;
  active?: boolean;

  [k: string]: unknown;
}


export interface EnvironmentDatasetPlan {
  id: number;
  label?: string;
  dataset_plan?: ResourceRef;
  user_add?: boolean;
  user_remove?: boolean;
  [k: string]: unknown;
}

export interface DatasetInPoolPlan {
  id: number;
  environment_dataset_plan?: EnvironmentDatasetPlan | ResourceRef;
  [k: string]: unknown;
}

export interface DatasetExpansion {
  id: number;
  vps?: ResourceRef;
  dataset?: ResourceRef;
  state?: string;
  original_refquota?: number;
  added_space?: number;
  enable_notifications?: boolean;
  enable_shrink?: boolean;
  stop_vps?: boolean;
  over_refquota_seconds?: number;
  max_over_refquota_seconds?: number;
  created_at?: string;
  [k: string]: unknown;
}

export interface DatasetExpansionHistory {
  id: number;
  added_space?: number;
  original_refquota?: number;
  new_refquota?: number;
  created_at?: string;
  admin?: ResourceRef;
  [k: string]: unknown;
}

export interface Snapshot {
  id: number;
  dataset?: ResourceRef;
  name: string;
  label?: string;
  created_at?: string;
  history_id?: number;
  mount?: ResourceRef;
  export?: ResourceRef;
  [k: string]: unknown;
}

export type SnapshotDownloadFormat = 'archive' | 'stream' | 'incremental_stream';

export interface SnapshotDownload {
  id: number;
  user?: ResourceRef;
  snapshot?: ResourceRef;
  from_snapshot?: ResourceRef;
  format?: SnapshotDownloadFormat;
  file_name?: string;
  url?: string;
  download_url?: string;
  download_link?: string;
  href?: string;
  link?: string;
  file_url?: string;
  size?: number; // MiB
  sha256sum?: string;
  ready?: boolean;
  expiration_date?: string;
  expires_at?: string;
  [k: string]: unknown;
}

export async function fetchDatasets(opts?: {
  fromId?: number;
  limit?: number;
  q?: string;
  user?: number;
  vps?: number;
  subtree?: number;
  withoutSnapshotIn?: number;
  includes?: string;
  reversed?: boolean;
  role?: 'primary' | 'hypervisor';
}) {
  const params: Record<string, unknown> = {};
  if (opts?.fromId !== undefined) params['from_id'] = opts.fromId;
  if (opts?.limit !== undefined) params['limit'] = opts.limit;
  if (opts?.q !== undefined) params['q'] = opts.q;
  if (opts?.user !== undefined) params['user'] = opts.user;
  if (opts?.vps !== undefined) params['vps'] = opts.vps;
  if (opts?.subtree !== undefined) params['subtree'] = opts.subtree;
  if (opts?.withoutSnapshotIn !== undefined) params['without_snapshot_in'] = opts.withoutSnapshotIn;
  if (opts?.reversed !== undefined) params['reversed'] = opts.reversed;
  if (opts?.role !== undefined) params['role'] = opts.role;

  const res = await haveApiCall<Dataset[]>({
    method: 'GET',
    path: '/datasets',
    namespace: 'dataset',
    params,
    meta: opts?.includes ? { includes: opts.includes } : undefined,
  });

  return { ...res, data: expectArray<Dataset>(res.data, 'datasets#index') };
}

export async function fetchDataset(datasetId: number, opts?: { includes?: string }) {
  return haveApiCall<Dataset>({
    method: 'GET',
    path: `/datasets/${datasetId}`,
    meta: opts?.includes ? { includes: opts.includes } : undefined,
  });
}

export type DatasetEditablePayload = {
  quota?: number;
  refquota?: number;
  compression?: boolean;
  recordsize?: number;
  atime?: boolean;
  relatime?: boolean;
  sync?: 'standard' | 'always' | 'disabled';
  sharenfs?: string;
  admin_override?: boolean;
  admin_lock_type?: 'no_lock' | 'absolute' | 'not_less' | 'not_more';
};

export type DatasetCreatePayload = DatasetEditablePayload & {
  name: string;
  dataset?: number;
  automount?: boolean;
};

export async function createDataset(payload: DatasetCreatePayload) {
  return haveApiCall<Dataset>({
    method: 'POST',
    path: '/datasets',
    namespace: 'dataset',
    params: payload,
  });
}

export async function updateDataset(datasetId: number, payload: DatasetEditablePayload) {
  return haveApiCall<void>({
    method: 'PUT',
    path: `/datasets/${datasetId}`,
    namespace: 'dataset',
    params: payload,
  });
}

export async function deleteDataset(datasetId: number) {
  return haveApiCall<void>({
    method: 'DELETE',
    path: `/datasets/${datasetId}`,
  });
}

export async function fetchDatasetSnapshots(datasetId: number, opts?: { fromId?: number; limit?: number; q?: string }) {
  const params: Record<string, unknown> = {};
  if (opts?.fromId !== undefined) params['from_id'] = opts.fromId;
  if (opts?.limit !== undefined) params['limit'] = opts.limit;
  if (opts?.q !== undefined) params['q'] = opts.q;

  const res = await haveApiCall<Snapshot[]>({
    method: 'GET',
    path: `/datasets/${datasetId}/snapshots`,
    namespace: 'snapshot',
    params,
  });

  return { ...res, data: expectArray<Snapshot>(res.data, `datasets/${datasetId}/snapshots#index`) };
}

export async function createDatasetSnapshot(datasetId: number, payload: { label?: string }) {
  return haveApiCall<Snapshot>({
    method: 'POST',
    path: `/datasets/${datasetId}/snapshots`,
    namespace: 'snapshot',
    params: payload,
  });
}

export async function deleteDatasetSnapshot(datasetId: number, snapshotId: number) {
  return haveApiCall<void>({
    method: 'DELETE',
    path: `/datasets/${datasetId}/snapshots/${snapshotId}`,
  });
}

export async function rollbackDatasetSnapshot(datasetId: number, snapshotId: number) {
  return haveApiCall<void>({
    method: 'POST',
    path: `/datasets/${datasetId}/snapshots/${snapshotId}/rollback`,
  });
}

export async function fetchSnapshotDownloads(opts?: {
  fromId?: number;
  limit?: number;
  dataset?: number;
  snapshot?: number;
  q?: string;
}) {
  const params: Record<string, unknown> = {};
  if (opts?.fromId !== undefined) params['from_id'] = opts.fromId;
  if (opts?.limit !== undefined) params['limit'] = opts.limit;
  if (opts?.dataset !== undefined) params['dataset'] = opts.dataset;
  if (opts?.snapshot !== undefined) params['snapshot'] = opts.snapshot;
  if (opts?.q !== undefined) params['q'] = opts.q;

  const res = await haveApiCall<SnapshotDownload[]>({
    method: 'GET',
    path: '/snapshot_downloads',
    namespace: 'snapshot_download',
    params,
  });

  return { ...res, data: expectArray<SnapshotDownload>(res.data, 'snapshot_downloads#index') };
}

export async function createSnapshotDownload(payload: {
  snapshot: number;
  from_snapshot?: number;
  format?: SnapshotDownloadFormat;
  send_mail?: boolean;
}) {
  return haveApiCall<SnapshotDownload>({
    method: 'POST',
    path: '/snapshot_downloads',
    namespace: 'snapshot_download',
    params: payload,
  });
}

export async function deleteSnapshotDownload(id: number) {
  return haveApiCall<void>({
    method: 'DELETE',
    path: `/snapshot_downloads/${id}`,
  });
}

export async function fetchDatasetPlans(datasetId: number, opts?: { limit?: number; fromId?: number; includes?: string }) {
  const params: Record<string, unknown> = {};
  if (opts?.limit !== undefined) params['limit'] = opts.limit;
  if (opts?.fromId !== undefined) params['from_id'] = opts.fromId;

  const res = await haveApiCall<DatasetInPoolPlan[]>({
    method: 'GET',
    path: `/datasets/${datasetId}/plans`,
    namespace: 'plan',
    params,
    meta: opts?.includes ? { includes: opts.includes } : undefined,
  });

  return { ...res, data: expectArray<DatasetInPoolPlan>(res.data, `datasets/${datasetId}/plans#index`) };
}

export async function fetchEnvironmentDatasetPlans(environmentId: number, opts?: { limit?: number; fromId?: number; includes?: string }) {
  const params: Record<string, unknown> = {};
  if (opts?.limit !== undefined) params['limit'] = opts.limit;
  if (opts?.fromId !== undefined) params['from_id'] = opts.fromId;

  const res = await haveApiCall<EnvironmentDatasetPlan[]>({
    method: 'GET',
    path: `/environments/${environmentId}/dataset_plans`,
    namespace: 'dataset_plan',
    params,
    meta: opts?.includes ? { includes: opts.includes } : undefined,
  });

  return { ...res, data: expectArray<EnvironmentDatasetPlan>(res.data, `environments/${environmentId}/dataset_plans#index`) };
}

export async function assignDatasetPlan(datasetId: number, payload: { environment_dataset_plan: number }) {
  return haveApiCall<DatasetInPoolPlan>({
    method: 'POST',
    path: `/datasets/${datasetId}/plans`,
    namespace: 'plan',
    params: payload,
  });
}

export async function deleteDatasetPlan(datasetId: number, planId: number) {
  return haveApiCall<void>({
    method: 'DELETE',
    path: `/datasets/${datasetId}/plans/${planId}`,
  });
}

export async function fetchDatasetExpansion(expansionId: number) {
  return haveApiCall<DatasetExpansion>({
    method: 'GET',
    path: `/dataset_expansions/${expansionId}`,
  });
}

export async function fetchDatasetExpansionHistory(expansionId: number, opts?: { limit?: number; fromId?: number; includes?: string }) {
  const params: Record<string, unknown> = {};
  if (opts?.limit !== undefined) params['limit'] = opts.limit;
  if (opts?.fromId !== undefined) params['from_id'] = opts.fromId;

  const res = await haveApiCall<DatasetExpansionHistory[]>({
    method: 'GET',
    path: `/dataset_expansions/${expansionId}/history`,
    namespace: 'history',
    params,
    meta: opts?.includes ? { includes: opts.includes } : undefined,
  });

  return { ...res, data: expectArray<DatasetExpansionHistory>(res.data, `dataset_expansions/${expansionId}/history#index`) };
}

export async function createDatasetExpansion(payload: {
  dataset: number;
  added_space: number;
  enable_notifications?: boolean;
  enable_shrink?: boolean;
  stop_vps?: boolean;
  max_over_refquota_seconds?: number;
}) {
  return haveApiCall<DatasetExpansion>({
    method: 'POST',
    path: '/dataset_expansions',
    namespace: 'dataset_expansion',
    params: payload,
  });
}

export async function updateDatasetExpansion(expansionId: number, payload: {
  enable_notifications?: boolean;
  enable_shrink?: boolean;
  stop_vps?: boolean;
  max_over_refquota_seconds?: number;
}) {
  return haveApiCall<DatasetExpansion>({
    method: 'PUT',
    path: `/dataset_expansions/${expansionId}`,
    namespace: 'dataset_expansion',
    params: payload,
  });
}

export async function registerExpandedDataset(payload: {
  dataset: number;
  original_refquota: number;
  enable_notifications?: boolean;
  enable_shrink?: boolean;
  stop_vps?: boolean;
  max_over_refquota_seconds?: number;
}) {
  return haveApiCall<DatasetExpansion>({
    method: 'POST',
    path: '/dataset_expansions/register_expanded',
    namespace: 'dataset_expansion',
    params: payload,
  });
}

export async function addDatasetExpansionSpace(expansionId: number, payload: { added_space: number }) {
  return haveApiCall<DatasetExpansionHistory>({
    method: 'POST',
    path: `/dataset_expansions/${expansionId}/history`,
    namespace: 'history',
    params: payload,
  });
}
