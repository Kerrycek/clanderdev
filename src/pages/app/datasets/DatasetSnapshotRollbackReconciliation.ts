import type { Dataset } from '../../../lib/api/datasets';
import type { TransactionChain } from '../../../lib/api/transactions';
import { hasActiveChains } from '../../../lib/taskStatus';

export type DatasetSnapshotRollbackReconcileResult = 'clear' | 'busy' | 'error';

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

/**
 * Re-reads every view of state used by snapshot rollback before an uncertain
 * durable lock can be acknowledged. Query refetches can resolve with an error
 * result, so both rejected promises and resolved error states fail closed.
 */
export async function reconcileDatasetSnapshotRollback(args: {
  datasetId: number;
  fetchActiveChains: () => Promise<unknown>;
  refetchChains: () => Promise<unknown>;
  refetchDataset: () => Promise<unknown>;
  refetchSnapshots: () => Promise<unknown>;
}): Promise<DatasetSnapshotRollbackReconcileResult> {
  try {
    const [activeChains, chainsResult, datasetResult, snapshotsResult] = await Promise.all([
      args.fetchActiveChains(),
      args.refetchChains(),
      args.refetchDataset(),
      args.refetchSnapshots(),
    ]);
    if (!isSuccessfulReadback(chainsResult)
      || !isSuccessfulReadback(datasetResult)
      || !isSuccessfulReadback(snapshotsResult)) return 'error';

    const recentChains = chainsResult.data;
    const snapshotsEnvelope = snapshotsResult['data'];
    if (!Array.isArray(activeChains)
      || !Array.isArray(recentChains)
      || !readbackContainsDataset(datasetResult.data, args.datasetId)
      || !isRecord(snapshotsEnvelope)
      || !Array.isArray(snapshotsEnvelope['data'])) return 'error';

    return hasActiveChains(activeChains as TransactionChain[]) ? 'busy' : 'clear';
  } catch {
    return 'error';
  }
}
