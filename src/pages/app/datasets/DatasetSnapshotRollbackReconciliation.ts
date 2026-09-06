import type { Dataset } from '../../../lib/api/datasets';
import type { TransactionChain } from '../../../lib/api/transactions';
import {
  normalizeLocalMutationIntent,
  type LocalMutationIntent,
} from '../../../lib/localLocks';
import type { ObjectRef } from '../../../lib/objectRef';
import { hasActiveChains } from '../../../lib/taskStatus';

export type DatasetSnapshotRollbackReconcileResult = 'manual' | 'busy' | 'error';

type QueryReadback = {
  data?: unknown;
  isError?: boolean;
  fetchStatus?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function isSuccessfulReadback(value: unknown): value is QueryReadback {
  return isRecord(value) && value['isError'] === false && value['fetchStatus'] !== 'paused';
}

function readbackContainsDataset(value: unknown, datasetId: number): boolean {
  if (!isRecord(value)) return false;
  if (Number(value['id']) === datasetId) return true;
  return Array.isArray(value['data'])
    && value['data'].some((row: Dataset) => Number(row?.id) === datasetId);
}

function positiveId(value: unknown): number | null {
  if (!isRecord(value)) return null;
  const raw = value['id'];
  const id = typeof raw === 'number' ? raw : Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function readChainList(value: unknown): TransactionChain[] | null {
  return Array.isArray(value) && value.every((chain) => positiveId(chain) !== null)
    ? value as TransactionChain[]
    : null;
}

export type DatasetSnapshotRollbackIntent = Extract<
  LocalMutationIntent,
  { type: 'dataset-snapshot-rollback' }
>;

export type DatasetSnapshotRollbackRequest = {
  datasetId: number;
  snapshotId: number;
  snapshotLabel: string;
  lockRef: ObjectRef;
  objectLabel: string;
};

export function createDatasetSnapshotRollbackIntent(
  snapshotId: number,
  snapshotLabel: string
): DatasetSnapshotRollbackIntent | null {
  const intent = normalizeLocalMutationIntent({
    type: 'dataset-snapshot-rollback',
    snapshotId,
    snapshotLabel,
  });
  return intent?.type === 'dataset-snapshot-rollback' ? intent : null;
}

export class DatasetSnapshotRollbackPreparationError extends Error {
  public readonly code = 'ROLLBACK_PREPARATION_FAILED';

  constructor(message: string) {
    super(message);
    this.name = 'DatasetSnapshotRollbackPreparationError';
  }
}

/** No local guard or POST is created unless the direct active-chain preflight succeeds. */
export async function prepareDatasetSnapshotRollbackIntent(args: {
  snapshotId: number;
  snapshotLabel: string;
  preflight: () => Promise<void>;
  errorMessage: string;
}): Promise<DatasetSnapshotRollbackIntent> {
  try {
    await args.preflight();
    const intent = createDatasetSnapshotRollbackIntent(args.snapshotId, args.snapshotLabel);
    if (!intent) throw new Error(args.errorMessage);
    return intent;
  } catch (error) {
    if (isRecord(error) && error['code'] === 'BUSY') throw error;
    throw new DatasetSnapshotRollbackPreparationError(args.errorMessage);
  }
}

/**
 * Re-reads every state surface used by snapshot rollback before offering the
 * explicit local-guard override. A finished Dataset chain cannot prove which
 * snapshot it targeted, so an ambiguous outcome never clears automatically.
 */
export async function reconcileDatasetSnapshotRollback(args: {
  datasetId: number;
  intent?: LocalMutationIntent;
  fetchActiveChains: () => Promise<unknown>;
  refetchChains: () => Promise<unknown>;
  refetchDataset: () => Promise<unknown>;
  refetchSnapshots: () => Promise<unknown>;
}): Promise<DatasetSnapshotRollbackReconcileResult> {
  try {
    const [activeReadback, chainsResult, datasetResult, snapshotsResult] = await Promise.all([
      args.fetchActiveChains(),
      args.refetchChains(),
      args.refetchDataset(),
      args.refetchSnapshots(),
    ]);
    if (!isSuccessfulReadback(chainsResult)
      || !isSuccessfulReadback(datasetResult)
      || !isSuccessfulReadback(snapshotsResult)) return 'error';

    const intent = normalizeLocalMutationIntent(args.intent);
    const activeChains = readChainList(activeReadback);
    const recentChains = readChainList(chainsResult.data);
    const snapshotsEnvelope = snapshotsResult['data'];
    if (intent?.type !== 'dataset-snapshot-rollback'
      || !activeChains
      || !recentChains
      || !readbackContainsDataset(datasetResult.data, args.datasetId)
      || !isRecord(snapshotsEnvelope)
      || !Array.isArray(snapshotsEnvelope['data'])) return 'error';

    return hasActiveChains([...activeChains, ...recentChains]) ? 'busy' : 'manual';
  } catch {
    return 'error';
  }
}
