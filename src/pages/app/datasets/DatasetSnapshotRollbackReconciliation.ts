import type { Dataset } from '../../../lib/api/datasets';
import type { TransactionChain } from '../../../lib/api/transactions';
import {
  normalizeLocalMutationIntent,
  type LocalMutationIntent,
} from '../../../lib/localLocks';
import type { ObjectRef } from '../../../lib/objectRef';
import { hasActiveChains, isFinishedChainState } from '../../../lib/taskStatus';

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

function positiveId(value: unknown): number | null {
  if (!isRecord(value)) return null;
  const raw = value['id'];
  const id = typeof raw === 'number' ? raw : Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function readMatchingChains(value: unknown): TransactionChain[] | null {
  if (!isRecord(value) || !Array.isArray(value['rollback']) || !Array.isArray(value['restore'])) return null;
  const chains = [...value['rollback'], ...value['restore']];
  return chains.every((chain) => positiveId(chain) !== null) ? chains as TransactionChain[] : null;
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
  lockRef: ObjectRef;
  objectLabel: string;
};

export function createDatasetSnapshotRollbackIntent(
  snapshotId: number,
  baselineReadback: unknown
): DatasetSnapshotRollbackIntent | null {
  const chains = readChainList(baselineReadback);
  if (!Number.isSafeInteger(snapshotId) || snapshotId <= 0 || !chains) return null;
  return {
    type: 'dataset-snapshot-rollback',
    snapshotId,
    baselineTransactionChainId: chains.reduce((max, chain) => Math.max(max, positiveId(chain)!), 0),
  };
}

export class DatasetSnapshotRollbackPreparationError extends Error {
  public readonly code = 'ROLLBACK_PREPARATION_FAILED';

  constructor(message: string) {
    super(message);
    this.name = 'DatasetSnapshotRollbackPreparationError';
  }
}

/** Preflight first, then capture the high-water mark so a fast foreign chain cannot become our proof. */
export async function prepareDatasetSnapshotRollbackIntent(args: {
  snapshotId: number;
  preflight: () => Promise<void>;
  fetchBaselineChains: () => Promise<unknown>;
  errorMessage: string;
}): Promise<DatasetSnapshotRollbackIntent> {
  try {
    await args.preflight();
    const intent = createDatasetSnapshotRollbackIntent(args.snapshotId, await args.fetchBaselineChains());
    if (!intent) throw new Error(args.errorMessage);
    return intent;
  } catch (error) {
    if (isRecord(error) && error['code'] === 'BUSY') throw error;
    throw new DatasetSnapshotRollbackPreparationError(
      error instanceof Error ? error.message : args.errorMessage
    );
  }
}

/**
 * Re-reads every view of state used by snapshot rollback before an uncertain
 * durable lock can be acknowledged. Absence is never proof: clearing requires
 * a finished matching chain created after the persisted pre-submit baseline.
 */
export async function reconcileDatasetSnapshotRollback(args: {
  datasetId: number;
  intent?: LocalMutationIntent;
  fetchActiveChains: () => Promise<unknown>;
  fetchMatchingChains: () => Promise<unknown>;
  refetchChains: () => Promise<unknown>;
  refetchDataset: () => Promise<unknown>;
  refetchSnapshots: () => Promise<unknown>;
}): Promise<DatasetSnapshotRollbackReconcileResult> {
  try {
    const [activeReadback, matchingReadback, chainsResult, datasetResult, snapshotsResult] = await Promise.all([
      args.fetchActiveChains(),
      args.fetchMatchingChains(),
      args.refetchChains(),
      args.refetchDataset(),
      args.refetchSnapshots(),
    ]);
    if (!isSuccessfulReadback(chainsResult)
      || !isSuccessfulReadback(datasetResult)
      || !isSuccessfulReadback(snapshotsResult)) return 'error';

    const intent = normalizeLocalMutationIntent(args.intent);
    const activeChains = readChainList(activeReadback);
    const matchingChains = readMatchingChains(matchingReadback);
    const recentChains = readChainList(chainsResult.data);
    const snapshotsEnvelope = snapshotsResult['data'];
    if (intent?.type !== 'dataset-snapshot-rollback'
      || !activeChains
      || !matchingChains
      || !recentChains
      || !readbackContainsDataset(datasetResult.data, args.datasetId)
      || !isRecord(snapshotsEnvelope)
      || !Array.isArray(snapshotsEnvelope['data'])) return 'error';

    if (hasActiveChains([...activeChains, ...recentChains, ...matchingChains])) return 'busy';
    const newMatchingChains = matchingChains.filter(
      (chain) => positiveId(chain)! > intent.baselineTransactionChainId
    );
    if (newMatchingChains.length === 0) return 'error';
    return newMatchingChains.every((chain) => isFinishedChainState(chain.state)) ? 'clear' : 'busy';
  } catch {
    return 'error';
  }
}
