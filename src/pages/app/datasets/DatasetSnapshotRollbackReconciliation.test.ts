import { describe, expect, it, vi } from 'vitest';

import { reconcileDatasetSnapshotRollback } from './DatasetSnapshotRollbackReconciliation';

function success(data: unknown) {
  return Promise.resolve({ data, isError: false, fetchStatus: 'idle' });
}

describe('reconcileDatasetSnapshotRollback', () => {
  it('requires successful chain, dataset and snapshot read-backs', async () => {
    const refetchSnapshots = vi.fn().mockResolvedValue({
      data: undefined,
      error: new Error('snapshot refresh failed'),
      isError: true,
      fetchStatus: 'idle',
    });

    await expect(reconcileDatasetSnapshotRollback({
      datasetId: 10,
      fetchActiveChains: () => Promise.resolve([]),
      refetchChains: () => success([{ id: 80, state: 'done' }]),
      refetchDataset: () => success({ id: 10 }),
      refetchSnapshots,
    })).resolves.toBe('error');
    expect(refetchSnapshots).toHaveBeenCalledOnce();
  });

  it('keeps the guard while a related transaction chain is active', async () => {
    await expect(reconcileDatasetSnapshotRollback({
      datasetId: 10,
      fetchActiveChains: () => Promise.resolve([{ id: 71, state: 'rollbacking' }]),
      refetchChains: () => success(Array.from({ length: 10 }, (_, index) => ({
        id: 90 - index,
        state: 'done',
      }))),
      refetchDataset: () => success({ id: 10 }),
      refetchSnapshots: () => success({ data: [{ id: 200 }] }),
    })).resolves.toBe('busy');
  });

  it('clears only after all fresh state is readable and no chain is active', async () => {
    await expect(reconcileDatasetSnapshotRollback({
      datasetId: 10,
      fetchActiveChains: () => Promise.resolve([]),
      refetchChains: () => success([{ id: 80, state: 'done' }]),
      refetchDataset: () => success({ data: [{ id: 10 }] }),
      refetchSnapshots: () => success({ data: [{ id: 200 }] }),
    })).resolves.toBe('clear');
  });
});
